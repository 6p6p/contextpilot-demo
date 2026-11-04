import { Resend } from 'resend';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import type { EmailPayload } from '../../../../shared/email.js';
import { PublicError } from '../errors.js';
export type SendOutcome = { status: 'accepted'; messageId: string; requestId: string | null } | { status: 'failed' | 'unknown'; errorCode: string; requestId: string | null };
export interface EmailProvider {
  verifySender(): Promise<void>;
  send(payload: EmailPayload, key: string, signal?: AbortSignal): Promise<SendOutcome>;
  inspect(messageId: string): Promise<{ event: string }>;
}
export const mailboxIdentity = (address: string) => { const at = address.lastIndexOf('@'); return address.slice(0, at) + address.slice(at).toLowerCase(); };
const knownRejections = new Set(['validation_error', 'missing_required_field', 'invalid_parameter', 'invalid_api_key', 'restricted_api_key', 'invalid_access', 'rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded']);
export function classifyProviderError(error: { name: string; statusCode?: number | null }): 'failed' | 'unknown' {
  return knownRejections.has(error.name) || error.statusCode !== undefined && error.statusCode !== null && [400,401,403,404,422,429].includes(error.statusCode) ? 'failed' : 'unknown';
}
export function providerEventStatus(event: string): 'accepted' | 'delivered' | 'failed' {
  if (['delivered','opened','clicked'].includes(event)) return 'delivered';
  if (['bounced','failed','suppressed','canceled','complained'].includes(event)) return 'failed';
  return 'accepted';
}
export function createResendProvider(env: Env, sdk?: Resend): EmailProvider | null {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return null;
  const client = sdk ?? new Resend(env.RESEND_API_KEY, { baseUrl: 'https://api.resend.com' });
  return {
    async verifySender() {
      if (env.EMAIL_MODE === 'test') {
        if (env.EMAIL_FROM !== 'onboarding@resend.dev' || !env.EMAIL_TEST_ACCOUNT_ADDRESS || !env.EMAIL_ALLOWED_RECIPIENTS.length || env.EMAIL_ALLOWED_RECIPIENTS.some(r => mailboxIdentity(r) !== mailboxIdentity(env.EMAIL_TEST_ACCOUNT_ADDRESS!))) throw new PublicError(503, 'EMAIL_TEST_MODE_RESTRICTED', '测试模式仅允许 onboarding@resend.dev 向 Resend 注册邮箱发送，白名单须仅包含该邮箱。账号实际权限仍须控制台核实。');
      } else {
        if (!env.RESEND_DOMAIN_ID) throw new PublicError(503, 'EMAIL_DOMAIN_NOT_CONFIGURED', '请配置并验证 Resend 发件域名。');
        const response = await client.domains.get(env.RESEND_DOMAIN_ID, { signal: AbortSignal.timeout(15000) });
        if (response.error || !response.data || response.data.status !== 'verified' || response.data.name.toLowerCase() !== env.EMAIL_FROM!.split('@')[1].toLowerCase() || response.data.capabilities?.sending !== 'enabled') throw new PublicError(503, 'EMAIL_DOMAIN_UNVERIFIED', '无法确认发件域名已验证且允许发送；请检查域名和 API Key 查询权限。');
      }
    },
    async send(payload, key, shutdown) {
      try {
        const response = await client.emails.send({ from: payload.sender, to: payload.recipients, subject: payload.subject, text: payload.body, headers: { 'X-ContextPilot-Delivery': key } }, { idempotencyKey: key, signal: AbortSignal.any([AbortSignal.timeout(20000), ...(shutdown ? [shutdown] : [])]) });
        const requestId = response.headers?.['x-request-id']?.slice(0,200) ?? null;
        if (response.error) return { status: classifyProviderError(response.error), errorCode: `RESEND_${response.error.name.replace(/[^a-zA-Z0-9_]/g,'_').slice(0,80).toUpperCase()}`, requestId };
        const id = z.string().min(1).max(200).safeParse(response.data?.id);
        return id.success ? { status: 'accepted', messageId: id.data, requestId } : { status: 'unknown', errorCode: 'EMAIL_INVALID_PROVIDER_RESPONSE', requestId };
      } catch { return { status: 'unknown', errorCode: 'EMAIL_PROVIDER_TIMEOUT_OR_NETWORK', requestId: null }; }
    },
    async inspect(messageId) {
      const response = await client.emails.get(messageId, { signal: AbortSignal.timeout(15000) });
      if (response.error || !response.data) throw new PublicError(502, 'EMAIL_STATUS_LOOKUP_FAILED', '供应商状态查询失败，原发送状态保留。请人工检查 Resend 控制台。');
      const event = z.string().min(1).max(100).safeParse(response.data.last_event);
      if (!event.success) throw new PublicError(502, 'EMAIL_STATUS_INVALID_RESPONSE', '供应商状态格式无效，保留原状态。');
      return { event: event.data };
    },
  };
}
