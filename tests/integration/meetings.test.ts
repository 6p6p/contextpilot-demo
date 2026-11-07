import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../apps/api/src/db/client.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { createMeetingService } from '../../apps/api/src/meetings/service.js';
import type { MeetingAnalysis } from '../../shared/meetings.js';
import type { PrivateStorage } from '../../apps/api/src/knowledge/storage.js';
import { PublicError } from '../../apps/api/src/errors.js';

describe('real PostgreSQL meeting transactions (stub Storage and LLM)', () => {
  let database: NonNullable<ReturnType<typeof createDatabase>>;
  const objects = new Map<string, Buffer>();
  const storage: PrivateStorage = { origin: `https://${randomUUID()}.invalid`, bucket: 'stub-private', async put(key, bytes) { objects.set(key, bytes); }, async get(key) { return objects.get(key)!; } };
  beforeAll(() => { if (process.env.RUN_LIVE_TESTS !== '1') throw new Error('Real database needs RUN_LIVE_TESTS=1'); database = createDatabase(parseEnv(process.env))!; if (!database) throw new Error('Database required'); });
  afterAll(async () => { await database?.pool.end(); });
  it('deduplicates, versions analyses and preserves manual todo/draft edits', async () => {
    const original = await readFile('tests/fixtures/meeting-risk.txt', 'utf8');
    const text = `${original}\n独立事务测试标记 ${randomUUID()}`;
    const lines = text.split('\n');
    const evidence = (line: number) => ({ startLine: line, endLine: line, quote: lines[line - 1] });
    const result: MeetingAnalysis = { topic: null, meetingDate: null, location: null, participants: [], topics: [], decisions: [], risks: [{ type: 'delivery', level: 'high', description: '交付延期', impact: '可能影响上线', evidence: [evidence(5)] }], actions: [{ task: '联系供应商确认交付计划', owner: '林岚', dueDate: '2026-11-05', evidence: evidence(7) }, { task: '补充回款风险台账', owner: null, dueDate: null, evidence: evidence(8) }] };
    let calls = 0;
    const service = createMeetingService(database, storage, { async complete() { calls++; return { model: 'stub-only', content: JSON.stringify(result) }; } });
    const uploaded = await service.upload('meeting-stub.txt', 'text/plain', Buffer.from(text));
    expect((await service.upload('again.txt', 'text/plain', Buffer.from(text))).meeting.id).toBe(uploaded.meeting.id);
    await service.processOne();
    let detail = await service.detail(uploaded.meeting.id);
    expect(detail.meeting.status).toBe('ready');
    expect(detail.todos.find(t => t.task === '补充回款风险台账')).toMatchObject({ owner: null, dueDate: null });
    const todo = detail.todos.find(t => t.task === '联系供应商确认交付计划')!;
    await expect(service.confirmDraft(detail.draft!.id, detail.draft!.version)).rejects.toMatchObject({ code: 'RECIPIENT_REQUIRED' });
    await service.updateTodo(todo.id, { version: todo.version, owner: '人工指定', dueDate: '2026-11-08', status: 'in_progress' });
    await expect(service.confirmDraft(detail.draft!.id, detail.draft!.version)).rejects.toMatchObject({ code: 'DRAFT_TODOS_STALE' });
    const draft = await service.updateDraft(detail.draft!.id, { version: detail.draft!.version, recipients: ['reviewer@example.invalid'], subject: '人工主题', body: '人工复核内容，不发送' });
    expect((await service.confirmDraft(draft.id, draft.version)).sent).toBe(false);
    await service.reanalyze(uploaded.meeting.id); await service.processOne();
    detail = await service.detail(uploaded.meeting.id);
    expect(calls).toBe(2); expect(detail.versions).toHaveLength(2);
    expect(detail.todos).toHaveLength(3); // two source actions + one explicit risk-follow-up suggestion
    expect(detail.todos.find(t => t.id === todo.id)).toMatchObject({ owner: '人工指定', dueDate: '2026-11-08', status: 'in_progress' });
    expect(detail.draft).toMatchObject({ subject: '人工主题', body: '人工复核内容，不发送', stale: true, deliveryState: 'not_sent' });
    await expect(service.confirmDraft(draft.id, draft.version)).rejects.toMatchObject({ code: 'DRAFT_ANALYSIS_STALE' });
  }, 90000);
  it('persists invalid structured output as failure, publishing no partial analysis', async () => {
    const service = createMeetingService(database, storage, { async complete() { return { model: 'stub', content: 'invalid-json' }; } });
    const row = await service.upload('bad-output.txt', 'text/plain', Buffer.from(`无风险测试 ${randomUUID()}`));
    await service.processOne();
    expect((await service.detail(row.meeting.id)).meeting).toMatchObject({ status: 'failed', errorCode: 'MEETING_INVALID_OUTPUT' });
    expect((await service.detail(row.meeting.id)).versions).toHaveLength(0);
  });
  it('keeps a truncated attempt unpublished and allows an explicit fresh analysis', async () => {
    let truncated = true;
    const service = createMeetingService(database, storage, { async complete() {
      if (truncated) throw new PublicError(502, 'LLM_OUTPUT_TRUNCATED', 'Synthetic length limit');
      return { model: 'stub-only', content: JSON.stringify({ topic: null, meetingDate: null, location: null, participants: [], topics: [], decisions: [], risks: [], actions: [] }) };
    } });
    const text = `合成截断恢复测试 ${randomUUID()}`;
    const row = await service.upload('truncated-output.txt', 'text/plain', Buffer.from(text));
    await service.processOne();
    const failed = await service.detail(row.meeting.id);
    expect(failed.meeting).toMatchObject({ status: 'failed', errorCode: 'LLM_OUTPUT_TRUNCATED', currentAnalysisId: null });
    expect(failed.versions).toHaveLength(0); expect(failed.todos).toHaveLength(0); expect(failed.draft).toBeNull();
    expect(await service.transcript(row.meeting.id)).toBe(text);
    truncated = false; await service.reanalyze(row.meeting.id); await service.processOne();
    const recovered = await service.detail(row.meeting.id);
    expect(recovered.meeting.status).toBe('ready'); expect(recovered.versions).toHaveLength(1);
  });
});
