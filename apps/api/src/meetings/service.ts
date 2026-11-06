import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, lt, or, sql } from 'drizzle-orm';
import { meetings, meetingAnalyses, meetingRisks, riskEvidence, meetingTodos, emailDrafts, emailDraftConfirmations, memoryJobs, emailDeliveries } from '../db/schema.js';
import type { Database } from '../knowledge/service.js';
import type { PrivateStorage } from '../knowledge/storage.js';
import type { ChatModel } from '../llm/adapter.js';
import { PublicError } from '../errors.js';
import {untrustedInstruction} from '../evidence/policy.js';
import {changedTodos,latestDraftBody} from './draft-state.js';
import { analyzeTranscript, decodeTranscript, sameAction, taskKey, validDate } from './analysis.js';
import { draftPatchSchema, todoPatchSchema, type MeetingAction } from '../../../../shared/meetings.js';

export function createMeetingService(database: Database, storage: PrivateStorage | null, model: ChatModel | null, shutdown?: AbortSignal, memoryScope?: string) {
  const db = database.db;
  async function requireMeeting(id: string) {
    const [row] = await db.select().from(meetings).where(eq(meetings.id, id));
    if (!row) throw new PublicError(404, 'MEETING_NOT_FOUND', '会议不存在。');
    return row;
  }
  async function detail(id: string) {
    const row = await requireMeeting(id);
    const analyses = await db.select().from(meetingAnalyses).where(eq(meetingAnalyses.meetingId, id)).orderBy(desc(meetingAnalyses.version));
    const risks = row.currentAnalysisId ? await db.select().from(meetingRisks).where(eq(meetingRisks.analysisId, row.currentAnalysisId)) : [];
    const evidence = risks.length ? await db.select().from(riskEvidence).where(sql`${riskEvidence.riskId} in (select id from meeting_risks where analysis_id = ${row.currentAnalysisId})`) : [];
    const todos = await db.select().from(meetingTodos).where(eq(meetingTodos.meetingId, id)).orderBy(asc(meetingTodos.updatedAt));
    const [draft] = await db.select().from(emailDrafts).where(eq(emailDrafts.meetingId, id));
    const [delivery] = draft ? await db.select({ status: emailDeliveries.status }).from(emailDeliveries).where(and(eq(emailDeliveries.draftId, draft.id), eq(emailDeliveries.version, draft.version))).limit(1) : [];
    // Explicit projection: never expose bucket, object key or credentials.
    return { meeting: { id: row.id, filename: row.filename, status: row.status, lineCount: row.lineCount, requestedVersion: row.requestedVersion, currentAnalysisId: row.currentAnalysisId, errorCode: row.errorCode, errorMessage: row.errorMessage },
      analysis: analyses.find(a => a.id === row.currentAnalysisId) ?? null, versions: analyses.map(a => ({ id: a.id, version: a.version, createdAt: a.createdAt })),
      risks: risks.map(risk => ({ ...risk, evidence: evidence.filter(e => e.riskId === risk.id) })), todos, draft: draft ? { ...draft, deliveryState: delivery?.status ?? 'not_sent', stale: draft.analysisId !== row.currentAnalysisId || await changedTodos(db,draft.id) } : null };
  }
  return {
    detail,
    list: () => db.select({ id: meetings.id, filename: meetings.filename, status: meetings.status, lineCount: meetings.lineCount, errorCode: meetings.errorCode, createdAt: meetings.createdAt }).from(meetings).orderBy(desc(meetings.createdAt)).limit(100),
    async transcript(id: string) { return (await requireMeeting(id)).transcript; },
    async upload(filename: string, mime: string, bytes: Buffer) {
      const transcript = decodeTranscript(filename, mime, bytes);
      if (!storage || !model) throw new PublicError(503, 'MEETING_NOT_CONFIGURED', '请配置私有 Storage 和模型服务。');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const id = randomUUID();
      const [created] = await db.insert(meetings).values({ id, filename, sha256, size: bytes.length, objectKey: `meetings/${id}.txt`, storageOrigin: storage.origin, storageBucket: storage.bucket, transcript, lineCount: transcript.split('\n').length, status: 'uploaded' }).onConflictDoNothing({ target: meetings.sha256 }).returning();
      if (!created) {
        const [existing] = await db.select({ id: meetings.id }).from(meetings).where(eq(meetings.sha256, sha256));
        return { ...(await detail(existing.id)), duplicate: true };
      }
      try {
        await storage.put(created.objectKey, bytes, 'text/plain');
        await db.update(meetings).set({ storageReady: true, updatedAt: new Date() }).where(eq(meetings.id, id));
      } catch {
        await db.update(meetings).set({ status: 'failed', errorCode: 'MEETING_STORAGE_FAILED', errorMessage: 'TXT 私有存储上传失败，请检查 Bucket 类型和权限。', updatedAt: new Date() }).where(eq(meetings.id, id));
      }
      return { ...(await detail(id)), duplicate: false };
    },
    async reanalyze(id: string) {
      if (!model || !storage) throw new PublicError(503, 'MEETING_NOT_CONFIGURED', '会议模型或存储未配置。');
      const [row] = await db.update(meetings).set({ status: 'uploaded', requestedVersion: sql`${meetings.requestedVersion} + 1`, attempts: 0, leaseToken: null, leaseUntil: null, errorCode: null, errorMessage: null, updatedAt: new Date() }).where(and(eq(meetings.id, id), eq(meetings.storageReady, true), or(eq(meetings.status, 'ready'), eq(meetings.status, 'failed')))).returning();
      if (!row) throw new PublicError(409, 'MEETING_BUSY_OR_UNSTORED', '会议处理中、尚未上传完成或不存在，不能重跑。');
      return detail(id);
    },
    async updateTodo(id: string, input: unknown) {
      const patch = todoPatchSchema.parse(input);
      if (patch.dueDate && !validDate(patch.dueDate)) throw new PublicError(400, 'INVALID_DATE', '日期无效。');
      return db.transaction(async tx=>{
      const [ref]=await tx.select({meetingId:meetingTodos.meetingId}).from(meetingTodos).where(eq(meetingTodos.id,id));
      if(!ref)throw new PublicError(404,'TODO_NOT_FOUND','待办不存在。');
      await tx.select({id:meetings.id}).from(meetings).where(eq(meetings.id,ref.meetingId)).for('update');
      const [updated] = await tx.update(meetingTodos).set({ owner: patch.owner, dueDate: patch.dueDate, status: patch.status, version: patch.version + 1, userEdited: true, updatedAt: sql`clock_timestamp()` }).where(and(eq(meetingTodos.id, id), eq(meetingTodos.version, patch.version))).returning();
      if (!updated) throw new PublicError(409, 'TODO_VERSION_CONFLICT', '待办不存在或版本已变化，请刷新。');
      return updated;
      });
    },
    async draftPreview(id:string){const [draft]=await db.select().from(emailDrafts).where(eq(emailDrafts.id,id));if(!draft)throw new PublicError(404,'DRAFT_NOT_FOUND','草稿不存在。');const data=await detail(draft.meetingId);return {version:draft.version,subject:draft.subject,body:latestDraftBody(data.todos.filter(t=>!untrustedInstruction(t.evidence.quote)),data.risks.filter(r=>r.evidence.every(e=>!untrustedInstruction(e.quote)))),sourceChanged:data.draft!.stale};},
    async updateDraft(id: string, input: unknown) {
      const patch = draftPatchSchema.parse(input);
      return db.transaction(async tx => {
        const [ref] = await tx.select({ meetingId: emailDrafts.meetingId }).from(emailDrafts).where(eq(emailDrafts.id, id));
        if (!ref) throw new PublicError(404, 'DRAFT_NOT_FOUND', '草稿不存在。');
        const [meeting] = await tx.select().from(meetings).where(eq(meetings.id, ref.meetingId)).for('update');
        const [draft] = await tx.select().from(emailDrafts).where(eq(emailDrafts.id, id)).for('update');
        if (!draft || draft.version !== patch.version) throw new PublicError(409, 'DRAFT_VERSION_CONFLICT', '草稿版本已变化，请刷新。');
        if (!meeting.currentAnalysisId || meeting.status !== 'ready') throw new PublicError(409, 'MEETING_NOT_READY', '请等待会议分析完成。');
        const [active] = await tx.select({ id: emailDeliveries.id }).from(emailDeliveries).where(and(eq(emailDeliveries.draftId, id), sql`${emailDeliveries.status} in ('queued','processing','unknown')`)).limit(1);
        if (active) throw new PublicError(409, 'EMAIL_PREVIOUS_UNRESOLVED', '此草稿已有待发送、处理中或未知发送，内容已冻结；请先核查发送结果。');
        const risks = await tx.select({ id: meetingRisks.id }).from(meetingRisks).where(eq(meetingRisks.analysisId, meeting.currentAnalysisId));
        const todos = await tx.select({ id: meetingTodos.id }).from(meetingTodos).where(eq(meetingTodos.meetingId, meeting.id));
        return (await tx.update(emailDrafts).set({ recipients: patch.recipients, subject: patch.subject, body: patch.body, version: draft.version + 1, state: 'draft', userEdited: true, analysisId: meeting.currentAnalysisId, riskIds: risks.map(r => r.id), todoIds: todos.map(t => t.id), updatedAt: sql`clock_timestamp()` }).where(eq(emailDrafts.id, id)).returning())[0];
      });
    },
    async confirmDraft(id: string, version: number) {
      return db.transaction(async tx => {
        const [ref] = await tx.select({ meetingId: emailDrafts.meetingId }).from(emailDrafts).where(eq(emailDrafts.id, id));
        if (!ref) throw new PublicError(404, 'DRAFT_NOT_FOUND', '草稿不存在。');
        const [meeting] = await tx.select().from(meetings).where(eq(meetings.id, ref.meetingId)).for('update');
        const [draft] = await tx.select().from(emailDrafts).where(eq(emailDrafts.id, id)).for('update');
        if (!draft || draft.version !== version) throw new PublicError(409, 'DRAFT_VERSION_CONFLICT', '确认版本已变化。');
        if (meeting.status !== 'ready' || meeting.currentAnalysisId !== draft.analysisId) throw new PublicError(409, 'DRAFT_ANALYSIS_STALE', '会议分析已变化，需人工复核保存草稿后再确认。');
        if(await changedTodos(tx,id))throw new PublicError(409,'DRAFT_TODOS_STALE','待办已变化，请按最新待办更新并保存草稿后重新确认。');
        if (!draft.recipients.length) throw new PublicError(400, 'RECIPIENT_REQUIRED', '请由用户明确填写收件邮箱并保存。');
        await tx.insert(emailDraftConfirmations).values({ draftId: id, version, snapshot: { recipients: draft.recipients, subject: draft.subject, body: draft.body, analysisId: draft.analysisId } }).onConflictDoNothing();
        const [confirmed] = await tx.update(emailDrafts).set({ state: 'confirmed' }).where(eq(emailDrafts.id, id)).returning();
        return { draft: confirmed, sent: false, message: '版本确认已保存，尚未创建发送任务；真实发送需要单独明确确认。' };
      });
    },
    async processOne() {
      if (!storage || !model || shutdown?.aborted) return false;
      const now = new Date();
      // Cleanup must use the same service boundary as task claiming.
      const scope = and(eq(meetings.storageOrigin, storage.origin), eq(meetings.storageBucket, storage.bucket));
      await db.update(meetings).set({ status: 'failed', errorCode: 'MEETING_UPLOAD_INTERRUPTED', errorMessage: '上传中断，原始文件未确认保存。' }).where(and(scope, eq(meetings.status, 'uploaded'), eq(meetings.storageReady, false), lt(meetings.createdAt, new Date(Date.now() - 300000))));
      await db.update(meetings).set({ status: 'failed', errorCode: 'MEETING_INTERRUPTED', errorMessage: '多次分析中断，已停止自动恢复。' }).where(and(scope, eq(meetings.status, 'processing'), lt(meetings.leaseUntil, now), sql`${meetings.attempts} >= 2`));
      const claimed = await db.transaction(async tx => {
        const [row] = await tx.select().from(meetings).where(and(eq(meetings.storageReady, true), eq(meetings.storageOrigin, storage.origin), eq(meetings.storageBucket, storage.bucket), sql`${meetings.attempts} < 2`, or(eq(meetings.status, 'uploaded'), and(eq(meetings.status, 'processing'), lt(meetings.leaseUntil, now))))).orderBy(meetings.createdAt).limit(1).for('update', { skipLocked: true });
        if (!row) return null;
        const token = randomUUID();
        await tx.update(meetings).set({ status: 'processing', attempts: row.attempts + 1, leaseToken: token, leaseUntil: new Date(Date.now() + 300000), updatedAt: now }).where(eq(meetings.id, row.id));
        return { ...row, token };
      });
      if (!claimed) return false;
      const owns = and(eq(meetings.id, claimed.id), eq(meetings.leaseToken, claimed.token), eq(meetings.status, 'processing'));
      const heartbeat = setInterval(() => { void db.update(meetings).set({ leaseUntil: new Date(Date.now() + 300000) }).where(owns).catch(() => {}); }, 30000);
      try {
        const bytes = await storage.get(claimed.objectKey);
        if (createHash('sha256').update(bytes).digest('hex') !== claimed.sha256) throw new PublicError(422, 'MEETING_HASH_MISMATCH', '会议原文校验失败。');
        const { result, model: analysisModel } = await analyzeTranscript(claimed.transcript, model);
        if (shutdown?.aborted) return false;
        await db.transaction(async tx => {
          const [owned] = await tx.select().from(meetings).where(owns).for('update');
          if (!owned) return;
          const [analysis] = await tx.insert(meetingAnalyses).values({ meetingId: claimed.id, version: claimed.requestedVersion, result, model: analysisModel }).returning();
          if (memoryScope) await tx.insert(memoryJobs).values({ scope: memoryScope, analysisId: analysis.id }).onConflictDoNothing();
          const risks = [];
          for (const risk of result.risks) {
            const [saved] = await tx.insert(meetingRisks).values({ meetingId: claimed.id, analysisId: analysis.id, type: risk.type, level: risk.level, description: risk.description, impact: risk.impact }).returning();
            await tx.insert(riskEvidence).values(risk.evidence.map(evidence => ({ riskId: saved.id, ...evidence })));
            risks.push({ ...saved, evidence: risk.evidence });
          }
          const existing = await tx.select().from(meetingTodos).where(eq(meetingTodos.meetingId, claimed.id)).for('update');
          const seen = new Set<string>();
          const todos = [];
          for (const action of result.actions) {
            const previous = existing.find(todo => todo.origin !== 'risk_followup' && sameAction({ ...todo, dueDate: todo.dueDate } as MeetingAction, action));
            const origin=action.category==='question'||/^(?:待确认|待讨论|是否|确认是否)/.test(action.task)?'meeting_question' as const:'meeting_action' as const;
            const sourceKey = previous?.sourceKey ?? taskKey(action);
            if (seen.has(sourceKey)) continue;
            seen.add(sourceKey);
            const associated = risks.filter(risk => risk.evidence.some(e => e.startLine <= action.evidence.endLine && e.endLine >= action.evidence.startLine)).map(r => r.id);
            const [saved] = await tx.insert(meetingTodos).values({ meetingId: claimed.id, analysisId: analysis.id, sourceKey, origin, task: action.task, owner: action.owner, dueDate: action.dueDate, evidence: action.evidence, riskIds: associated }).onConflictDoUpdate({ target: [meetingTodos.meetingId, meetingTodos.sourceKey], set: { analysisId: analysis.id, riskIds: associated } }).returning();
            todos.push(saved);
          }
          for (const risk of risks) {
            if (todos.some(todo => todo.riskIds.includes(risk.id))) continue;
            const anchor = risk.evidence[0];
            const previous = existing.find(todo => todo.origin === 'risk_followup' && todo.evidence.startLine <= anchor.endLine && anchor.startLine <= todo.evidence.endLine);
            const sourceKey = previous?.sourceKey ?? `risk:${anchor.startLine}`;
            const related = risks.filter(r => r.evidence.some(e => e.startLine <= anchor.endLine && anchor.startLine <= e.endLine)).map(r => r.id);
            const [saved] = await tx.insert(meetingTodos).values({ meetingId: claimed.id, analysisId: analysis.id, sourceKey, task: `复核并跟进风险：${risk.description}`, origin: 'risk_followup', owner: null, dueDate: null, evidence: risk.evidence[0], riskIds: related }).onConflictDoUpdate({ target: [meetingTodos.meetingId, meetingTodos.sourceKey], set: { analysisId: analysis.id, riskIds: related } }).returning();
            todos.push(saved);
          }
          // No address inference or outbound mail tool. Existing edited drafts are never overwritten.
          if (risks.length) await tx.insert(emailDrafts).values({ meetingId: claimed.id, analysisId: analysis.id, riskIds: risks.map(r => r.id), todoIds: todos.map(t => t.id), recipients: [],
            subject: `会议风险跟进：${result.topic?.value ?? claimed.filename}`,
            body: `请复核以下潜在风险与待办（AI 分析，需人工确认）：\n\n${risks.map((r, i) => `${i + 1}. [${r.level}] ${r.description}\n潜在影响：${r.impact}\n依据：${r.evidence.map(e => `L${e.startLine}–${e.endLine} ${e.quote}`).join('\n')}`).join('\n\n')}\n\n待办：\n${todos.map(t => `${t.origin==='risk_followup'?'[建议] ':t.origin==='meeting_question'?'[待确认] ':'[明确行动] '}${t.task}；负责人：${t.owner ?? '未知'}；截止日期：${t.dueDate ?? '未知'}`).join('\n')}\n\n本草稿由AI准备，真实发送必须人工复核并单独确认。`,
          }).onConflictDoNothing({ target: emailDrafts.meetingId });
          await tx.update(meetings).set({ status: 'ready', currentAnalysisId: analysis.id, errorCode: null, errorMessage: null, leaseUntil: null, updatedAt: new Date() }).where(owns);
        });
      } catch (error) {
        if (shutdown?.aborted) return false;
        await db.update(meetings).set({ status: 'failed', errorCode: error instanceof PublicError ? error.code : 'MEETING_ANALYSIS_FAILED', errorMessage: error instanceof PublicError ? error.message : '会议分析失败，未发布不完整结果。', leaseUntil: null, updatedAt: new Date() }).where(owns);
      } finally { clearInterval(heartbeat); }
      return true;
    },
  };
}
