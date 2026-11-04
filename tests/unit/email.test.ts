import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResendProvider, classifyProviderError, providerEventStatus } from '../../apps/api/src/email/provider.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { matchesConfirmation, payloadHash, validateRecipients } from '../../apps/api/src/email/service.js';
import { sendEmailSchema } from '../../shared/email.js';
const env = () => parseEnv({ RESEND_API_KEY: 'test-placeholder-not-real', EMAIL_FROM: 'onboarding@resend.dev', EMAIL_ALLOWED_RECIPIENTS: 'owner@example.invalid', EMAIL_TEST_ACCOUNT_ADDRESS: 'owner@example.invalid' });
const payload = { sender: 'onboarding@resend.dev', recipients: ['owner@example.invalid'], subject: '测试', body: '正文' };
afterEach(() => vi.unstubAllGlobals());
describe('Email adapter and permission gates (MOCK transport, no real mail)', () => {
  it('requires explicit send confirmation and server allowlist', () => {
    expect(sendEmailSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(sendEmailSchema.safeParse({ version: 1, confirmSend: false }).success).toBe(false);
    expect(() => validateRecipients(['other@example.invalid'], ['owner@example.invalid'])).toThrow('白名单');
    expect(() => validateRecipients([], [])).toThrow();
    validateRecipients(['owner@EXAMPLE.INVALID'], ['owner@example.invalid']);
    expect(() => validateRecipients(['OWNER@example.invalid'], ['owner@example.invalid'])).toThrow('白名单');
  });
  it('binds exact snapshot and hashes only frozen business fields', () => {
    const source = { ...payload, analysisId: 'a' };
    expect(matchesConfirmation(source, source)).toBe(true);
    expect(matchesConfirmation(source, { ...source, body: 'changed' })).toBe(false);
    expect(payloadHash({ ...payload, id: 'ignored' } as typeof payload)).toBe(payloadHash(payload));
  });
  it('uses the official SDK and stable Idempotency-Key, never retries', async () => {
    const transport = vi.fn(async (_input, init) => { expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('draft/v1'); return Response.json({ id: 'provider-test-id' }, { headers: { 'x-request-id': 'trace-test' } }); });
    vi.stubGlobal('fetch', transport);
    const provider = createResendProvider(env())!;
    await provider.verifySender();
    expect(await provider.send(payload, 'draft/v1')).toMatchObject({ status: 'accepted', messageId: 'provider-test-id', requestId: 'trace-test' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('records network/timeout uncertainty and no SDK retry', async () => {
    const transport = vi.fn(async () => { throw new Error('synthetic network'); }); vi.stubGlobal('fetch', transport);
    expect((await createResendProvider(env())!.send(payload, 'draft/v1')).status).toBe('unknown');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('preserves provider rejection rather than claiming accepted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ name: 'validation_error', message: 'synthetic rejection' }, { status: 422 })));
    expect(await createResendProvider(env())!.send(payload, 'draft/v1')).toMatchObject({ status: 'failed', errorCode: 'RESEND_VALIDATION_ERROR' });
  });
  it('treats 5xx, ambiguous conflicts and malformed success as unknown', async () => {
    expect(classifyProviderError({ name: 'application_error', statusCode: 500 })).toBe('unknown');
    expect(classifyProviderError({ name: 'invalid_idempotent_request', statusCode: 409 })).toBe('unknown');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
    expect((await createResendProvider(env())!.send(payload, 'draft/v1')).status).toBe('unknown');
  });
  it('does not equate acceptance with delivery and refuses test mode recipients', async () => {
    expect(providerEventStatus('sent')).toBe('accepted'); expect(providerEventStatus('delivered')).toBe('delivered'); expect(providerEventStatus('bounced')).toBe('failed');
    const changed = { ...env(), EMAIL_ALLOWED_RECIPIENTS: ['other@example.invalid'] };
    await expect(createResendProvider(changed)!.verifySender()).rejects.toThrow('注册邮箱');
    expect(createResendProvider(parseEnv({}))).toBeNull();
  });
  it('checks verified domain using read-only SDK calls before allowing sender', async () => {
    const configured = { ...env(), EMAIL_MODE: 'verified' as const, EMAIL_FROM: 'demo@example.invalid', RESEND_DOMAIN_ID: 'f043bf8a-c7ae-47a9-82af-45958d61db43' };
    const transport = vi.fn(async (_url, options) => { expect(options?.method).toBe('GET'); return Response.json({ name: 'example.invalid', status: 'pending', capabilities: { sending: 'enabled' } }); }); vi.stubGlobal('fetch', transport);
    await expect(createResendProvider(configured)!.verifySender()).rejects.toThrow('域名'); expect(transport).toHaveBeenCalledTimes(1);
  });
});
