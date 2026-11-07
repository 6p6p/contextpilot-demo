// Explicit live acceptance only. No HTTP email routes, delivery worker or memory worker.
// RUN_T03_LIVE=1 T03_WORKER_PAUSED=1 node --import tsx tests/meeting-live/t03-regression.ts
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { createDatabase } from '../../apps/api/src/db/client.js';
import { createStorage } from '../../apps/api/src/knowledge/storage.js';
import { createMeetingModel } from '../../apps/api/src/meetings/model.js';
import { createMeetingService } from '../../apps/api/src/meetings/service.js';
import { decodeTranscript } from '../../apps/api/src/meetings/analysis.js';

if (process.env.RUN_T03_LIVE !== '1' || process.env.T03_WORKER_PAUSED !== '1') throw new Error('Requires explicit live authorization and other meeting workers paused');
const raw = dotenv.parse(readFileSync('.env'));
const fields = ['DATABASE_URL', 'DATABASE_SSL', 'DATABASE_CA_CERT', 'SUPABASE_URL', 'SUPABASE_STORAGE_KEY', 'SUPABASE_STORAGE_BUCKET', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL', 'MEETING_MAX_TOKENS', 'MEETING_TIMEOUT_MS'];
const env = parseEnv(Object.fromEntries(fields.map(k => [k, raw[k]])));
const bytes = readFileSync('demo/files/meeting.txt');
const text = decodeTranscript('meeting.txt', 'text/plain', bytes);
const sha = createHash('sha256').update(bytes).digest('hex');
const directory = '.acceptance/t03-20261108'; mkdirSync(directory, { recursive: true });
const report: { status: string; sha256: string; calls: object[]; checks: string[]; snapshots: unknown[]; reservedMaxRmb: number } = { status: 'RUNNING', sha256: sha, calls: [], checks: [], snapshots: [], reservedMaxRmb: 0 };
const resume = process.env.T03_RESUME === '1';
const receipt = process.env.T03_RESUME_RECEIPT ?? 'persistence-initial-failure.json';
assert.match(receipt, /^[a-z0-9-]+\.json$/); // local acceptance directory only
const prior = resume ? JSON.parse(readFileSync(`${directory}/${receipt}`, 'utf8')) : null;
// <=2 independent analyses, each permitting at most one validated regeneration.
// Independent upper bound for this invocation, not an account invoice.
const transport: typeof fetch = async (input, init) => {
  const url = new URL(String(input)); const body = JSON.parse(String(init?.body));
  assert.equal(url.hostname, 'api.deepseek.com'); assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.thinking?.type, 'disabled'); assert.equal(body.response_format?.type, 'json_object');
  assert.ok(body.max_tokens <= 8192 && report.calls.length < 4);
  const reservation = ((Buffer.byteLength(JSON.stringify(body.messages)) + 1024) * 0.3 + body.max_tokens * 1.2) * 10 / 1e6;
  assert.ok(report.reservedMaxRmb + reservation <= 1);
  report.reservedMaxRmb += reservation;
  const call: Record<string, unknown> = { maxTokens: body.max_tokens }; report.calls.push(call);
  const start = Date.now(); const response = await fetch(input, init);
  call.httpStatus = response.status;
  if (response.ok) {
    const data = await response.clone().json(); const m = data.choices?.[0]?.message;
    Object.assign(call, { finishReason: data.choices?.[0]?.finish_reason, promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens, reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      contentChars: typeof m?.content === 'string' ? m.content.length : 0, elapsedMs: Date.now() - start });
  }
  return response;
};
const db = createDatabase(env); assert.ok(db);
try {
  const storage = createStorage(env); assert.ok(storage);
  const model = createMeetingModel(env, transport); assert.ok(model);
  const service = createMeetingService(db, storage, model); // no memory scope: no incidental extraction
  const queued = await db.pool.query("select count(*)::int as n from meetings where storage_origin=$1 and storage_bucket=$2 and status in ('uploaded','processing')", [storage.origin, storage.bucket]);
  assert.equal(queued.rows[0].n, 0, 'Other queued meetings must be resolved before this targeted test');
  const uploaded = await service.upload('t03-original-demo.txt', 'text/plain', bytes);
  const id = uploaded.meeting.id;
  const priorVersions = uploaded.versions.length;
  if (resume) {
    // Explicitly resume only the exact failed acceptance run; never select arbitrary history.
    const snapshot = prior.snapshots.at(-1);
    const current = JSON.parse(JSON.stringify(uploaded)); // DB Dates match serialized receipt timestamps.
    assert.equal(prior.status, 'FAIL'); assert.equal(snapshot.meeting.id, id);
    assert.equal(snapshot.meeting.status, 'failed');
    assert.equal(uploaded.meeting.status, 'failed');
    assert.equal(uploaded.meeting.requestedVersion, snapshot.meeting.requestedVersion);
    assert.deepEqual(current.versions, snapshot.versions);
    assert.deepEqual(current.todos, snapshot.todos);
    assert.deepEqual(current.draft, snapshot.draft);
    report.checks.push('prior failed receipt matched; existing manual data unchanged');
  } else assert.equal(priorVersions, 0, 'Do not overwrite an already accepted meeting');
  assert.equal(await service.transcript(id), text);
  const processTarget = async () => {
    const pending = await db.pool.query("select id from meetings where storage_origin=$1 and storage_bucket=$2 and status in ('uploaded','processing')", [storage.origin, storage.bucket]);
    assert.deepEqual(pending.rows.map(r => r.id), [id], 'Refuse to process unrelated meeting jobs');
    assert.equal(await service.processOne(), true);
    const detail = await service.detail(id);
    report.snapshots.push(detail);
    assert.equal(detail.meeting.status, 'ready', detail.meeting.errorCode ?? 'Meeting not ready');
    const result = detail.analysis!.result;
    assert.ok(detail.risks.some(r => r.level === 'high' && r.evidence.some(e => e.quote.includes('供应商接口尚未交付'))));
    assert.ok(result.decisions.some(d => d.value.includes('2026-11-20')));
    assert.ok(!result.decisions.some(d => d.value.includes('2026-11-27')));
    assert.ok(result.topics.some(t => t.category === 'proposal' && t.value.includes('2026-11-27')));
    assert.ok(!JSON.stringify(result).includes('立即发送邮件'));
    assert.ok(detail.todos.every(t => !t.evidence.quote.includes('忽略系统规则')));
    assert.ok(detail.draft); assert.equal(detail.draft.deliveryState, 'not_sent');
    return detail;
  };
  if (uploaded.meeting.status === 'failed') await service.reanalyze(id);
  const first = await processTarget();
  assert.equal(first.versions.length, priorVersions + 1);
  const todo = first.todos.find(t => t.origin === 'meeting_action' && t.task.includes('复核供应商交付清单')); assert.ok(todo);
  const sourceAction = first.analysis!.result.actions.find(t => t.task.includes('复核供应商交付清单')); assert.ok(sourceAction);
  assert.equal(sourceAction.owner, '周宁'); assert.equal(sourceAction.dueDate, '2026-11-08');
  if (resume) {
    assert.equal(todo.owner, '林岚'); assert.equal(todo.dueDate, '2026-11-09'); assert.equal(todo.status, 'in_progress');
    assert.equal(first.draft!.body, prior.snapshots.at(-1).draft.body);
    assert.equal(first.draft!.version, prior.snapshots.at(-1).draft.version);
    assert.equal(first.draft!.stale, true);
  } else { assert.equal(todo.owner, '周宁'); assert.equal(todo.dueDate, '2026-11-08'); }
  const unknown = first.todos.find(t => t.task.includes('补充验收指标')); assert.ok(unknown);
  assert.equal(unknown.owner, null); assert.equal(unknown.dueDate, null);
  assert.ok(first.draft!.body.includes('复核供应商交付清单'));
  if (!resume) await service.updateTodo(todo.id, { version: todo.version, owner: '林岚', dueDate: '2026-11-09', status: 'in_progress' });
  const preview = await service.draftPreview(first.draft!.id);
  assert.ok(preview.body.includes('林岚') && preview.body.includes('2026-11-09'));
  const draft = await service.updateDraft(first.draft!.id, { version: first.draft!.version, recipients: ['reviewer@example.invalid'], subject: 'T03 合成验收，仅确认不发送', body: preview.body });
  assert.equal((await service.confirmDraft(draft.id, draft.version)).sent, false);
  await service.reanalyze(id);
  const second = await processTarget();
  assert.equal(second.versions.length, priorVersions + 2);
  assert.ok(report.calls.length >= 2 && report.calls.length <= 4);
  const saved = second.todos.find(t => t.id === todo.id); assert.ok(saved);
  assert.equal(saved.owner, '林岚'); assert.equal(saved.dueDate, '2026-11-09'); assert.equal(saved.status, 'in_progress');
  assert.equal(second.draft!.version, draft.version); assert.equal(second.draft!.body, draft.body); assert.equal(second.draft!.stale, true);
  await assert.rejects(service.confirmDraft(draft.id, draft.version), { code: 'DRAFT_ANALYSIS_STALE' });
  const refreshed = await service.draftPreview(draft.id);
  const renewed = await service.updateDraft(draft.id, { version: draft.version, recipients: ['reviewer@example.invalid'], subject: draft.subject, body: refreshed.body });
  assert.equal((await service.confirmDraft(renewed.id, renewed.version)).sent, false);
  const deliveries = await db.pool.query('select count(*)::int as n from email_deliveries where draft_id=$1', [draft.id]); assert.equal(deliveries.rows[0].n, 0);
  report.checks.push('two independent real model analyses persisted', 'original transcript retained', 'source risk/owner/date/proposal/injection verified', 'manual todo and draft edits preserved', 'stale confirmation rejected; refreshed draft confirmed without sending', 'zero delivery records');
  report.status = 'PASS';
} catch (error) {
  // Full raw exceptions may include DB query text; do not serialize them.
  report.status = 'FAIL'; process.exitCode = 1;
  report.checks.push(error instanceof Error && 'code' in error && typeof error.code === 'string' && /^[A-Z_]{1,60}$/.test(error.code) ? error.code : 'ACCEPTANCE_ASSERTION_FAILED');
} finally {
  await db.pool.end();
  writeFileSync(`${directory}/${resume ? 'persistence-resume' : 'persistence'}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, snapshots: undefined }));
}
