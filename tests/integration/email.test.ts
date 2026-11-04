import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../../apps/api/src/db/client.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { emailDrafts, meetings, meetingAnalyses, emailDeliveries, emailDraftConfirmations } from '../../apps/api/src/db/schema.js';
import { createMeetingService } from '../../apps/api/src/meetings/service.js';
import { createEmailService } from '../../apps/api/src/email/service.js';
import type { EmailProvider } from '../../apps/api/src/email/provider.js';

describe('email delivery transactions (REAL PostgreSQL, STUB provider, NO real sends)', () => {
  let database: NonNullable<ReturnType<typeof createDatabase>>;
  let other: typeof database;
  const config = () => ({ EMAIL_DELIVERY_ENABLED: true, EMAIL_SCOPE: `mail-${randomUUID()}`, EMAIL_FROM: 'sender@example.invalid', EMAIL_ALLOWED_RECIPIENTS: ['owner@example.invalid'], EMAIL_MODE: 'verified' as const, RESEND_DOMAIN_ID: undefined });
  const accepted: EmailProvider = { async verifySender() {}, async send() { return { status: 'accepted', messageId: randomUUID(), requestId: 'stub-request' }; }, async inspect() { return { event: 'delivered' }; } };
  async function fixture() {
    const id = randomUUID();
    await database.db.insert(meetings).values({ id, filename: 'email-stub-test.txt', sha256: randomUUID(), size: 1, objectKey: id, storageOrigin: 'https://stub.invalid', storageBucket: 'stub', transcript: '合成测试', lineCount: 1, status: 'ready' });
    const [analysis] = await database.db.insert(meetingAnalyses).values({ meetingId: id, version: 1, model: 'STUB', result: { topic: null, meetingDate: null, location: null, participants: [], topics: [], decisions: [], risks: [], actions: [] } }).returning();
    await database.db.update(meetings).set({ currentAnalysisId: analysis.id }).where(eq(meetings.id, id));
    return (await database.db.insert(emailDrafts).values({ meetingId: id, analysisId: analysis.id, riskIds: [], todoIds: [], recipients: ['owner@example.invalid'], subject: '合成测试，禁止真实发信', body: '仅数据库测试，无邮件服务调用' }).returning())[0];
  }
  beforeAll(() => { if (process.env.RUN_LIVE_TESTS !== '1') throw new Error('Authorized real DB required'); database = createDatabase(parseEnv(process.env))!; other = createDatabase(parseEnv(process.env))!; });
  afterAll(async () => { await Promise.all([database?.pool.end(), other?.pool.end()]); });
  it('rejects unconfirmed, edited and non-allowlisted drafts; config disabled cannot enqueue', async () => {
    const draft = await fixture(); const c = config(); const service = createEmailService(database, accepted, c); const editor = createMeetingService(database, null, null);
    await expect(service.enqueue(draft.id, 1, 'unconfirmed')).rejects.toMatchObject({ code: 'EMAIL_CONFIRMATION_REQUIRED' });
    await editor.confirmDraft(draft.id, 1);
    const edited = await editor.updateDraft(draft.id, { version: 1, recipients: draft.recipients, subject: 'changed', body: draft.body });
    await expect(service.enqueue(draft.id, 1, 'old')).rejects.toMatchObject({ code: 'EMAIL_CONFIRMATION_REQUIRED' });
    await expect(service.enqueue(draft.id, edited.version, 'new-unconfirmed')).rejects.toMatchObject({ code: 'EMAIL_CONFIRMATION_REQUIRED' });
    await editor.confirmDraft(draft.id, edited.version);
    await expect(createEmailService(database, accepted, { ...c, EMAIL_ALLOWED_RECIPIENTS: ['different@example.invalid'] }).enqueue(draft.id, edited.version, 'whitelist')).rejects.toMatchObject({ code: 'EMAIL_RECIPIENT_NOT_ALLOWED' });
    await expect(createEmailService(database, accepted, { ...c, EMAIL_DELIVERY_ENABLED: false }).enqueue(draft.id, edited.version, 'disabled')).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_DISABLED' });
    expect(await service.list(draft.id)).toHaveLength(0);
  }, 90000);
  it('concurrent confirmations and send clicks create one immutable record; lease expiry never makes a second send', async () => {
    const draft = await fixture(); const c = config(); const editor = createMeetingService(database, null, null);
    await Promise.all([editor.confirmDraft(draft.id, 1), createMeetingService(other, null, null).confirmDraft(draft.id, 1)]);
    expect(await database.db.select().from(emailDraftConfirmations).where(eq(emailDraftConfirmations.draftId, draft.id))).toHaveLength(1);
    let enter!: () => void, release!: () => void; const started = new Promise<void>(r => { enter = r; }); const held = new Promise<void>(r => { release = r; });
    let sends = 0; let key = '';
    const provider: EmailProvider = { ...accepted, async send(payload, idempotencyKey) { sends++; key = idempotencyKey; expect(payload.body).toBe(draft.body); enter(); await held; return { status: 'accepted', messageId: 'stub-provider-id', requestId: 'stub-trace' }; } };
    const first = createEmailService(database, provider, c), second = createEmailService(other, provider, c);
    const [one, two] = await Promise.all([first.enqueue(draft.id, 1, 'click-1'), second.enqueue(draft.id, 1, 'click-2')]); expect(one.id).toBe(two.id);
    await expect(editor.updateDraft(draft.id, { version: 1, recipients: draft.recipients, subject: 'cannot-change', body: draft.body })).rejects.toMatchObject({ code: 'EMAIL_PREVIOUS_UNRESOLVED' });
    const running = first.processOne();
    try { await started; expect(await second.processOne()).toBe(false); await database.db.update(emailDeliveries).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(emailDeliveries.id, one.id)); expect(await second.processOne()).toBe(false); expect((await second.list(draft.id))[0].status).toBe('unknown'); } finally { release(); await running; }
    expect(sends).toBe(1); expect(key).toBe(`contextpilot/email/${draft.id}/v1`);
    expect((await first.list(draft.id))[0]).toMatchObject({ status: 'accepted', providerMessageId: 'stub-provider-id', providerRequestId: 'stub-trace' });
    expect(await second.processOne()).toBe(false); expect((await second.enqueue(draft.id, 1, 'again')).id).toBe(one.id); expect(sends).toBe(1);
    expect((await second.refresh(one.id)).status).toBe('delivered');
    const fresh = createDatabase(parseEnv(process.env))!;
    try { expect((await createEmailService(fresh, provider, c).list(draft.id))[0]).toMatchObject({ status: 'delivered', body: draft.body }); } finally { await fresh.pool.end(); }
  }, 120000);
  it('network timeout remains unknown permanently; duplicate request and restarts never resend', async () => {
    const draft = await fixture(); await createMeetingService(database, null, null).confirmDraft(draft.id, 1); const c = config(); let sends = 0;
    const provider: EmailProvider = { ...accepted, async send() { sends++; throw new Error('simulated timeout after remote acceptance'); } };
    const first = createEmailService(database, provider, c); const row = await first.enqueue(draft.id, 1, 'timeout'); await first.processOne();
    expect((await first.list(draft.id))[0]).toMatchObject({ status: 'unknown', providerMessageId: null });
    await database.db.update(emailDeliveries).set({ createdAt: new Date(Date.now() - 172800000) }).where(eq(emailDeliveries.id, row.id));
    const restarted = createEmailService(other, provider, c); expect(await restarted.processOne()).toBe(false); expect((await restarted.enqueue(draft.id, 1, 'after-idempotency-window')).id).toBe(row.id); expect(sends).toBe(1);
    await expect(restarted.refresh(row.id)).rejects.toMatchObject({ code: 'EMAIL_MANUAL_CHECK_REQUIRED' });
    await expect(createMeetingService(database, null, null).updateDraft(draft.id, { version: 1, recipients: draft.recipients, subject: 'bypass', body: draft.body })).rejects.toMatchObject({ code: 'EMAIL_PREVIOUS_UNRESOLVED' });
  }, 90000);
  it('worker revalidates allowlist/version and persists provider errors truthfully', async () => {
    const draft = await fixture(); await createMeetingService(database, null, null).confirmDraft(draft.id, 1); const c = config(); let sends = 0;
    const rejected: EmailProvider = { ...accepted, async send() { sends++; return { status: 'failed', errorCode: 'RESEND_VALIDATION_ERROR', requestId: 'stub' }; } };
    const first = createEmailService(database, rejected, c); const row = await first.enqueue(draft.id, 1, 'error');
    await createEmailService(database, rejected, { ...c, EMAIL_ALLOWED_RECIPIENTS: [] }).processOne();
    expect((await first.list(draft.id))[0]).toMatchObject({ status: 'failed', errorCode: 'EMAIL_RECIPIENT_NOT_ALLOWED' }); expect(sends).toBe(0);
    const editor = createMeetingService(database, null, null); const next = await editor.updateDraft(draft.id, { version: 1, recipients: draft.recipients, subject: 'new explicitly confirmed version', body: draft.body }); await editor.confirmDraft(draft.id, next.version);
    await first.enqueue(draft.id, next.version, 'provider-rejection'); await first.processOne();
    expect((await first.list(draft.id))[0]).toMatchObject({ status: 'failed', errorCode: 'RESEND_VALIDATION_ERROR' }); expect(sends).toBe(1);
    expect(await createEmailService(other, rejected, { ...c, EMAIL_SCOPE: `foreign-${c.EMAIL_SCOPE}` }).processOne()).toBe(false);
  }, 90000);
  it('rejects a stale confirmed version at dispatch without contacting the provider', async () => {
    const draft = await fixture(); await createMeetingService(database, null, null).confirmDraft(draft.id, 1); const c = config(); let sends = 0;
    const service = createEmailService(database, { ...accepted, async send() { sends++; return { status: 'accepted', messageId: 'not-expected', requestId: null }; } }, c);
    await service.enqueue(draft.id, 1, 'before-stale');
    // Synthetic direct DB mutation simulates state changed outside normal guarded UI.
    await database.db.update(emailDrafts).set({ state: 'draft', version: 2 }).where(eq(emailDrafts.id, draft.id));
    await service.processOne(); expect(sends).toBe(0); expect((await service.list(draft.id))[0]).toMatchObject({ status: 'failed', errorCode: 'EMAIL_FROZEN_VERSION_INVALID' });
  }, 90000);

});
