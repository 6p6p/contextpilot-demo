import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, lt, inArray, isNull } from 'drizzle-orm';
import { emailDeliveries, emailDrafts, emailDraftConfirmations, meetings } from '../db/schema.js';
import type { Database } from '../knowledge/service.js';
import type { Env } from '../config/env.js';
import type { EmailPayload } from '../../../../shared/email.js';
import { PublicError } from '../errors.js';
import { providerEventStatus, mailboxIdentity, type EmailProvider, type SendOutcome } from './provider.js';
export type EmailConfig = Pick<Env, 'EMAIL_DELIVERY_ENABLED' | 'EMAIL_SCOPE' | 'EMAIL_FROM' | 'EMAIL_ALLOWED_RECIPIENTS' | 'EMAIL_MODE' | 'RESEND_DOMAIN_ID'>;
export const payloadHash = (payload: EmailPayload) => createHash('sha256').update(JSON.stringify([payload.sender, payload.recipients, payload.subject, payload.body])).digest('hex');
export function validateRecipients(recipients: string[], allowed: string[]) {
  const whitelist = new Set(allowed.map(mailboxIdentity));
  if (!recipients.length || recipients.length > 10 || recipients.some(r => !whitelist.has(mailboxIdentity(r)))) throw new PublicError(403, 'EMAIL_RECIPIENT_NOT_ALLOWED', '收件人必须全部属于服务端演示白名单。');
}
export function matchesConfirmation(draft: { recipients: string[]; subject: string; body: string; analysisId: string }, snapshot: typeof draft) {
  return JSON.stringify([draft.recipients, draft.subject, draft.body, draft.analysisId]) === JSON.stringify([snapshot.recipients, snapshot.subject, snapshot.body, snapshot.analysisId]);
}
const publicFields = { id: emailDeliveries.id, draftId: emailDeliveries.draftId, version: emailDeliveries.version, sender: emailDeliveries.sender, recipients: emailDeliveries.recipients, subject: emailDeliveries.subject, body: emailDeliveries.body, status: emailDeliveries.status, providerMessageId: emailDeliveries.providerMessageId, providerEvent: emailDeliveries.providerEvent, errorCode: emailDeliveries.errorCode, requestId: emailDeliveries.requestId, providerRequestId: emailDeliveries.providerRequestId, createdAt: emailDeliveries.createdAt, attemptedAt: emailDeliveries.attemptedAt, acceptedAt: emailDeliveries.acceptedAt, checkedAt: emailDeliveries.checkedAt };
export function createEmailService(database: Database, provider: EmailProvider | null, config: EmailConfig, shutdown?: AbortSignal) {
  const db = database.db;
  const identity = createHash('sha256').update(JSON.stringify([config.EMAIL_SCOPE, config.EMAIL_FROM, config.EMAIL_MODE, config.RESEND_DOMAIN_ID])).digest('hex');
  const boundary = and(eq(emailDeliveries.scope, config.EMAIL_SCOPE), eq(emailDeliveries.configIdentity, identity));
  function enabled() {
    if (!config.EMAIL_DELIVERY_ENABLED) throw new PublicError(503, 'EMAIL_DELIVERY_DISABLED', '真实邮件发送未启用，不能创建发送任务。');
    if (!provider || !config.EMAIL_FROM || !config.EMAIL_ALLOWED_RECIPIENTS.length) throw new PublicError(503, 'EMAIL_NOT_CONFIGURED', '请配置 Resend、发件地址和收件人白名单。');
  }
  const result = (id: string) => db.select(publicFields).from(emailDeliveries).where(and(eq(emailDeliveries.id, id), eq(emailDeliveries.scope, config.EMAIL_SCOPE))).then(rows => rows[0]);
  return {
    configuration: () => ({ enabled: config.EMAIL_DELIVERY_ENABLED, configured: Boolean(provider && config.EMAIL_FROM && config.EMAIL_ALLOWED_RECIPIENTS.length), sender: config.EMAIL_FROM ?? null, mode: config.EMAIL_MODE, allowedRecipients: config.EMAIL_ALLOWED_RECIPIENTS }),
    async preflight() { enabled(); await provider!.verifySender(); return { status: 'sender_checked', message: '发件配置检查通过；账号额度、测试邮箱归属及实际发送权限仍须控制台核实。没有发送邮件。' }; },
    list: (draftId: string) => db.select(publicFields).from(emailDeliveries).where(and(eq(emailDeliveries.scope, config.EMAIL_SCOPE), eq(emailDeliveries.draftId, draftId))).orderBy(desc(emailDeliveries.createdAt)).limit(100),
    async enqueue(draftId: string, version: number, requestId: string) {
      enabled();
      const [existing] = await db.select().from(emailDeliveries).where(and(eq(emailDeliveries.draftId, draftId), eq(emailDeliveries.version, version)));
      if (existing) {
        if (existing.scope !== config.EMAIL_SCOPE) throw new PublicError(409, 'EMAIL_ALREADY_RECORDED', '此草稿版本已有发送记录，不能跨环境重复发送。');
        return result(existing.id);
      }
      await provider!.verifySender(); // Read-only preflight: never sends.
      const deliveryId = await db.transaction(async tx => {
        const [ref] = await tx.select({ meetingId: emailDrafts.meetingId }).from(emailDrafts).where(eq(emailDrafts.id, draftId));
        if (!ref) throw new PublicError(404, 'DRAFT_NOT_FOUND', '草稿不存在。');
        const [meeting] = await tx.select().from(meetings).where(eq(meetings.id, ref.meetingId)).for('update');
        const [draft] = await tx.select().from(emailDrafts).where(eq(emailDrafts.id, draftId)).for('update');
        const [repeat] = await tx.select().from(emailDeliveries).where(and(eq(emailDeliveries.draftId, draftId), eq(emailDeliveries.version, version)));
        if (repeat) { if (repeat.scope !== config.EMAIL_SCOPE) throw new PublicError(409, 'EMAIL_ALREADY_RECORDED', '此版本已有记录。'); return repeat.id; }
        if (!draft || draft.version !== version || draft.state !== 'confirmed') throw new PublicError(409, 'EMAIL_CONFIRMATION_REQUIRED', '必须先复核并确认当前保存版本；修改后旧确认无效。');
        if (meeting.status !== 'ready' || meeting.currentAnalysisId !== draft.analysisId) throw new PublicError(409, 'DRAFT_ANALYSIS_STALE', '会议分析已变化，需重新复核草稿。');
        const [confirmation] = await tx.select().from(emailDraftConfirmations).where(and(eq(emailDraftConfirmations.draftId, draftId), eq(emailDraftConfirmations.version, version)));
        if (!confirmation || !matchesConfirmation(draft, confirmation.snapshot)) throw new PublicError(409, 'EMAIL_CONFIRMATION_MISMATCH', '确认快照与草稿不一致，未创建发送任务。');
        validateRecipients(draft.recipients, config.EMAIL_ALLOWED_RECIPIENTS);
        const [unresolved] = await tx.select({ id: emailDeliveries.id }).from(emailDeliveries).where(and(eq(emailDeliveries.draftId, draftId), inArray(emailDeliveries.status, ['queued','processing','unknown']))).limit(1);
        if (unresolved) throw new PublicError(409, 'EMAIL_PREVIOUS_UNRESOLVED', '此前发送仍处理中或结果未知，必须先人工核查，不能创建新版本重发。');
        const payload: EmailPayload = { sender: config.EMAIL_FROM!, recipients: draft.recipients, subject: draft.subject, body: draft.body };
        const [saved] = await tx.insert(emailDeliveries).values({ scope: config.EMAIL_SCOPE, configIdentity: identity, draftId, confirmationId: confirmation.id, version, analysisId: draft.analysisId, ...payload, payloadHash: payloadHash(payload), idempotencyKey: `contextpilot/email/${draftId}/v${version}`, requestId }).returning();
        return saved.id;
      });
      return result(deliveryId);
    },
    async refresh(id: string) {
      if (!provider) throw new PublicError(503, 'EMAIL_NOT_CONFIGURED', '邮件服务未配置。');
      const [row] = await db.select().from(emailDeliveries).where(and(boundary, eq(emailDeliveries.id, id)));
      if (!row) throw new PublicError(404, 'EMAIL_DELIVERY_NOT_FOUND', '发送记录不存在或配置已变化。');
      if (!row.providerMessageId) throw new PublicError(409, 'EMAIL_MANUAL_CHECK_REQUIRED', '没有供应商邮件ID，无法自动核查。请用时间、收件人、主题和追踪ID在Resend控制台人工核查，禁止盲目重发。');
      const status = await provider.inspect(row.providerMessageId);
      let next = providerEventStatus(status.event);
      if (next === 'accepted' && (row.status === 'delivered' || row.status === 'failed')) next = row.status;
      // CAS prevents an older concurrent status lookup from overwriting a newer result.
      await db.update(emailDeliveries).set({ status: next, providerEvent: status.event.slice(0,100), errorCode: next === 'failed' ? `RESEND_EVENT_${status.event.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase()}` : null, checkedAt: new Date() }).where(and(eq(emailDeliveries.id, id), eq(emailDeliveries.status, row.status), row.checkedAt ? eq(emailDeliveries.checkedAt, row.checkedAt) : isNull(emailDeliveries.checkedAt)));
      return result(id);
    },
    async processOne() {
      if (!config.EMAIL_DELIVERY_ENABLED || !provider || shutdown?.aborted) return false;
      // Email processing is NEVER reclaimed: after the durable attempt barrier it may have sent.
      await db.update(emailDeliveries).set({ status: 'unknown', errorCode: 'EMAIL_ATTEMPT_INTERRUPTED', leaseUntil: null }).where(and(boundary, eq(emailDeliveries.status, 'processing'), lt(emailDeliveries.leaseUntil, new Date())));
      const claimed = await db.transaction(async tx => {
        const [row] = await tx.select().from(emailDeliveries).where(and(boundary, eq(emailDeliveries.status, 'queued'))).orderBy(emailDeliveries.createdAt).limit(1).for('update', { skipLocked: true });
        if (!row) return null;
        const [ref] = await tx.select().from(emailDrafts).where(eq(emailDrafts.id, row.draftId));
        const [meeting] = await tx.select().from(meetings).where(eq(meetings.id, ref.meetingId)).for('update');
        const [draft] = await tx.select().from(emailDrafts).where(eq(emailDrafts.id, row.draftId)).for('update');
        const [confirmation] = await tx.select().from(emailDraftConfirmations).where(eq(emailDraftConfirmations.id, row.confirmationId));
        try {
          validateRecipients(row.recipients, config.EMAIL_ALLOWED_RECIPIENTS);
          if (!draft || draft.state !== 'confirmed' || draft.version !== row.version || meeting.status !== 'ready' || meeting.currentAnalysisId !== row.analysisId || !confirmation || !matchesConfirmation(draft, confirmation.snapshot) || !matchesConfirmation({ ...row, analysisId: row.analysisId }, confirmation.snapshot) || payloadHash(row) !== row.payloadHash) throw new PublicError(409, 'EMAIL_FROZEN_VERSION_INVALID', '发送前校验失败，未调用邮件服务。');
        } catch (error) {
          await tx.update(emailDeliveries).set({ status: 'failed', errorCode: error instanceof PublicError ? error.code : 'EMAIL_VALIDATION_FAILED' }).where(eq(emailDeliveries.id, row.id));
          return { skip: true as const };
        }
        const token = randomUUID();
        await tx.update(emailDeliveries).set({ status: 'processing', leaseToken: token, leaseUntil: new Date(Date.now() + 300000), attemptedAt: new Date() }).where(eq(emailDeliveries.id, row.id));
        return { skip: false as const, row, token };
      });
      if (!claimed) return false;
      if (claimed.skip) return true;
      const owns = and(eq(emailDeliveries.id, claimed.row.id), eq(emailDeliveries.leaseToken, claimed.token), inArray(emailDeliveries.status, ['processing','unknown']));
      let outcome: SendOutcome;
      try { await provider.verifySender(); }
      catch (error) {
        await db.update(emailDeliveries).set({ status: 'failed', errorCode: error instanceof PublicError ? error.code : 'EMAIL_PREFLIGHT_FAILED', leaseUntil: null }).where(owns);
        return true;
      }
      if (shutdown?.aborted) { await db.update(emailDeliveries).set({ status: 'unknown', errorCode: 'EMAIL_ATTEMPT_INTERRUPTED', leaseUntil: null }).where(owns); return false; }
      try { outcome = await provider.send({ sender: claimed.row.sender, recipients: claimed.row.recipients, subject: claimed.row.subject, body: claimed.row.body }, claimed.row.idempotencyKey, shutdown); }
      catch { outcome = { status: 'unknown', errorCode: 'EMAIL_PROVIDER_EXCEPTION', requestId: null }; }
      try {
        await db.update(emailDeliveries).set({ status: outcome.status, providerMessageId: outcome.status === 'accepted' ? outcome.messageId : null, providerRequestId: outcome.requestId, errorCode: outcome.status === 'accepted' ? null : outcome.errorCode, acceptedAt: outcome.status === 'accepted' ? new Date() : null, leaseUntil: null }).where(owns);
      } catch {
        // Preserve the provider ID if possible, but NEVER repeat the HTTP send after a DB failure.
        await db.update(emailDeliveries).set({ status: 'unknown', errorCode: 'EMAIL_RESULT_PERSIST_FAILED', providerMessageId: outcome.status === 'accepted' ? outcome.messageId : null, providerRequestId: outcome.requestId, leaseUntil: null }).where(owns).catch(() => {});
      }
      return true;
    },
  };
}
