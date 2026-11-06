import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';
import Fastify from 'fastify';
import {registerDemoAccess} from '../../apps/api/src/demo/access.js';
import {registerManagementRoutes} from '../../apps/api/src/management.js';
import {parseEnv} from '../../apps/api/src/config/env.js';
import {createPresentationSources} from '../../apps/api/src/presentations/sources.js';
import {PublicError} from '../../apps/api/src/errors.js';
import { eq, inArray } from 'drizzle-orm';
import { configuredDatabase, newRun, saveRun, snapshot, inventory, localStorage, digest, runDirectory, tables } from '../support/corpus-db.js';
import * as schema from '../../apps/api/src/db/schema.js';
import { createChatService } from '../../apps/api/src/chat/service.js';
import { createDocumentService } from '../../apps/api/src/knowledge/service.js';
import { createRetriever, createKnowledgeAnswerer, insufficientEvidence } from '../../apps/api/src/knowledge/retrieval.js';
import { createMeetingService } from '../../apps/api/src/meetings/service.js';
import { createMemoryService } from '../../apps/api/src/memory/service.js';
import { createPresentationService } from '../../apps/api/src/presentations/service.js';
import { createRepairPublisher } from '../../apps/api/src/presentations/publication.js';
import { renderPresentation, validatePptx } from '../../apps/api/src/presentations/render.js';
import { project, transcript, analysis, memoryText, web, searchQuestion, searchSelection, plan, sources as goldenSources } from '../corpus/v1/materials.js';
import type { ChatModel } from '../../apps/api/src/llm/adapter.js';
import type { PptSource } from '../../shared/presentations.js';

// REAL shared PostgreSQL; no migrations, real providers, cloud Storage, cleanup, app/worker startup.
describe('Corpus Stage A: shared PostgreSQL / external STUB only', () => {
  const run = newRun(), storage = localStorage(run);
  let database: ReturnType<typeof configuredDatabase>;
  let ready = false, halted = false;
  const outbound = vi.fn(() => { throw new Error('CORPUS_FORBIDS_EXTERNAL_FETCH'); });
  const stub = (value: unknown): ChatModel => ({ async complete() { return { model: 'CORPUS-STUB', content: typeof value === 'string' ? value : JSON.stringify(value) }; } });
  const embedder = { space: `${run.scope}_embedding`, dimensions: 3, async embed(texts: string[]) { return texts.map(() => [1, 0, 0]); } };
  const chat = () => createChatService(database, stub(`本会话项目${project.id}，负责人${project.owner}。`));
  const memory = () => createMemoryService(database, stub({ facts: [
    { kind: 'person', content: '林岚', evidence: { startLine: 1, endLine: 1, quote: memoryText } },
    { kind: 'place', content: '南京', evidence: { startLine: 1, endLine: 1, quote: memoryText } },
    { kind: 'time', content: '2026-11-06', evidence: { startLine: 1, endLine: 1, quote: memoryText } },
  ] }), embedder, run.scope);
  let meetingService: ReturnType<typeof createMeetingService>;
  let pptId: string, pptSources: PptSource[];
  beforeAll(async () => {
    if (process.env.CORPUS_SHARED_DB_AUTHORIZED !== '1' || process.env.RUN_LIVE_TESTS !== '1') throw new Error('CORPUS_SHARED_DB_AUTHORIZATION_REQUIRED');
    await saveRun(run); // Journal all preallocated roots BEFORE any database write.
    vi.stubGlobal('fetch', outbound);
    let step = 'configuration';
    try {
      database = configuredDatabase(); database.pool.on('error', () => {});
      step = 'SELECT_1';
      await database.pool.query('select 1');
      step = 'baseline_snapshot';
      run.baseline = await snapshot(database);
      step = 'fresh_scope_checks';
      for (const table of ['conversations', 'documents', 'meetings'] as const) for (const id of run.roots[table]) expect(run.baseline[table][id]).toBeUndefined();
      for (const table of ['documents', 'meetings', 'presentation_jobs']) {
        const count = (await database.pool.query(`select count(*)::int as n from ${table} where storage_origin=$1`, [run.origin])).rows[0].n;
        expect(count).toBe(0);
      }
      for (const table of ['memories', 'memory_jobs', 'presentation_jobs']) expect((await database.pool.query(`select count(*)::int as n from ${table} where scope=$1`, [run.scope])).rows[0].n).toBe(0);
      await saveRun(run); ready = true;
    } catch (error) {
      const code = (error as { code?: string }).code ?? (/timeout/i.test(String((error as Error).message)) ? 'CONNECTION_TIMEOUT' : 'CHECK_FAILED');
      halted = true; run.results.T01.reason = `preflight ${step}: ${code}; no business writes`; await saveRun(run);
      throw new Error(`CORPUS_PREFLIGHT_FAILED: ${step} ${code}`);
    }
  }, 120000);
  afterAll(async () => {
    try {
      if (ready) {
        await inventory(database, run);
        const after = await snapshot(database);
        for (const table of tables) for (const [id, hash] of Object.entries(run.baseline[table])) if (after[table][id] !== hash) run.baselineChanges.push({ table, id, change: after[table][id] ? 'changed' : 'missing' });
        await saveRun(run);
        console.log(JSON.stringify({ runId: run.runId, created: Object.fromEntries(tables.map(t => [t, run.inventory[t].length])), baselineChanges: run.baselineChanges.length, cloudStorageObjects: 0, externalCalls: run.externalCalls }));
        expect(run.baselineChanges, 'Pre-existing rows changed concurrently; inspect before attributing cause. Do not overwrite/restore.').toEqual([]);
      }
      if (!ready) { for (const item of Object.values(run.results)) if (item.reason === 'not executed') item.reason = 'preflight incomplete; no business test executed'; await saveRun(run); }
      expect(outbound).not.toHaveBeenCalled();
    } finally { await database?.pool.end(); vi.unstubAllGlobals(); }
  }, 120000);
  afterEach(async ({ task }) => {
    if (task.result?.state === 'fail') {
      halted = true;
      const id = task.name.match(/^T0[1-8]/)?.[0];
      if (id) run.results[id] = { ...run.results[id], result: 'FAIL', reason: 'test failed or timed out; subsequent writes stopped' };
      await saveRun(run);
    }
  });
  function testCase(id: string, name: string, action: () => Promise<void>) {
    run.results[id]??={result:'NOT_RUN',dependency:'real PostgreSQL; all external providers STUB',reason:'not executed'};
    it(`${id} ${name}`, async context => {
      if (halted) { run.results[id].reason = 'prior failure; further writes stopped'; await saveRun(run); context.skip(); return; }
      let failure: unknown;
      try { await action(); } catch (error) { failure = error; halted = true; }
      try { await inventory(database, run); } catch (error) { failure ??= error; halted = true; }
      run.results[id] = { ...run.results[id], result: failure ? 'FAIL' : 'PASS', reason: failure ? 'see redacted Vitest assertion/code; exact-ID reconciliation may be incomplete' : '' };
      await saveRun(run);
      if (failure) throw failure;
    }, 120000);
  }
  testCase('T01', 'multi-turn persistence, request idempotency, independent pools and owned failure recovery', async () => {
    await database.db.insert(schema.conversations).values(run.roots.conversations.map((id, i) => ({ id, title: `CORPUS-STUB ${run.runId} session ${i + 1}` })));
    const first = { content: memoryText, clientRequestId: randomUUID(), searchMode: 'off' as const };
    await chat().send(run.roots.conversations[0], first); await chat().send(run.roots.conversations[0], first);
    await chat().send(run.roots.conversations[0], { content: '刚才的项目负责人是谁？', clientRequestId: randomUUID(), searchMode: 'off' });
    await chat().send(run.roots.conversations[1], { content: '另一个项目ORCHID-FIN，地点苏州。', clientRequestId: randomUUID(), searchMode: 'off' });
    const independent = configuredDatabase();
    try {
      const restored = await createChatService(independent, null).history(run.roots.conversations[0]);
      expect(restored).toHaveLength(4); expect(restored.every(m => m.status === 'completed')).toBe(true);
      expect(restored.map(m => m.content).join('')).not.toContain('苏州');
      expect((await createChatService(independent, null).history(run.roots.conversations[1]))).toHaveLength(2);
    } finally { await independent.pool.end(); }
    const failed = createChatService(database, { async complete() { throw new Error('SYNTHETIC_FAILURE'); } });
    const rows = await failed.send(run.roots.conversations[2], { content: '合成失败测试', clientRequestId: randomUUID(), searchMode: 'off' });
    const assistant = rows.find(r => r.role === 'assistant')!;
    expect((await failed.history(run.roots.conversations[2]))[1].status).toBe('failed');
    await database.db.update(schema.messages).set({ status: 'processing', createdAt: new Date(Date.now() - 240000) }).where(eq(schema.messages.id, assistant.id));
    expect((await failed.history(run.roots.conversations[2]))[1]).toMatchObject({ status: 'failed', errorCode: 'GENERATION_INTERRUPTED' });
  });
  testCase('T02', 'PDF queue, chunks, metadata and exact citation persistence', async () => {
    for (const [i, path] of project.pdfs.entries()) {
      const bytes = await readFile(path), id = run.roots.documents[i], objectKey = `pdf/${id}.pdf`;
      await database.db.insert(schema.documents).values({ id, filename: `CORPUS-STUB-${run.runId}-${path.split('/').at(-1)}`, size: bytes.length, sha256: digest(bytes), objectKey, storageOrigin: run.origin, storageBucket: run.bucket, embeddingSpace: embedder.space, dimensions: 3, storageReady: true, status: 'uploaded' });
      await storage.put(objectKey, bytes);
    }
    const documents = createDocumentService(database, storage, embedder);
    for (let i = 0; i < 3; i++) expect(await documents.processOne()).toBe(true);
    expect(await documents.processOne()).toBe(false);
    for (const id of run.roots.documents) expect(await documents.get(id)).toMatchObject({ status: 'ready', pageCount: 2 });
    const answerer = createKnowledgeAnswerer(createRetriever(database, embedder, 0.5));
    const selection: ChatModel = { async complete(history) {
      const data = JSON.parse(history[1].content); const source = data.untrustedPdfData.find((s: { text: string }) => s.text.includes(project.code));
      return { model: 'CORPUS-STUB-RAG', content: JSON.stringify({ citations: [{ sourceId: source.sourceId, quote: project.code }] }) };
    } };
    const service = createChatService(database, selection, answerer);
    await service.send(run.roots.conversations[0], { content: 'ORCHID-7421的launch access code？', knowledgeMode: true, searchMode: 'off', clientRequestId: randomUUID() });
    const saved = (await service.history(run.roots.conversations[0])).at(-1)!;
    expect(saved.status).toBe('completed'); expect(saved.sources).toMatchObject([{ documentId: run.roots.documents[0], page: 2, quote: project.code }]);
  });
  testCase('T03', 'PDF no-evidence answer and empty citations persist', async () => {
    const answerer = createKnowledgeAnswerer(createRetriever(database, embedder, 0.5));
    const service = createChatService(database, stub({ citations: [] }), answerer);
    await service.send(run.roots.conversations[0], { content: '正式生产上线日期是否已批准？', knowledgeMode: true, searchMode: 'off', clientRequestId: randomUUID() });
    const last = (await service.history(run.roots.conversations[0])).at(-1)!;
    expect(last.content).toBe(insufficientEvidence); expect(last.sources).toEqual([]);
  });
  testCase('T04', 'meeting transactions, edited todos/draft, confirmation and failed analysis', async () => {
    for (const [i, id] of run.roots.meetings.entries()) {
      const text = `${transcript}\n合成验收Run ID：${run.runId}；场景${i}。`;
      const bytes = Buffer.from(text), objectKey = `meetings/${id}.txt`;
      await database.db.insert(schema.meetings).values({ id, filename: `CORPUS-STUB-${run.runId}-${i}.txt`, sha256: digest(bytes), size: bytes.length, objectKey, storageOrigin: run.origin, storageBucket: run.bucket, transcript: text, lineCount: 12, storageReady: true, status: 'uploaded' });
      await storage.put(objectKey, bytes);
    }
    meetingService = createMeetingService(database, storage, stub(analysis));
    // Fail the second synthetic meeting first, leaving the real service to claim only the first.
    await database.db.update(schema.meetings).set({ status: 'failed', errorCode: 'CORPUS_SEEDED_FAILURE' }).where(eq(schema.meetings.id, run.roots.meetings[1]));
    expect(await meetingService.processOne()).toBe(true);
    let detail = await meetingService.detail(run.roots.meetings[0]);
    expect(detail.meeting.status).toBe('ready'); expect(detail.risks[0]).toMatchObject({ level: 'high' });
    const todo = detail.todos.find(t => t.task === analysis.actions[0].task)!;
    await meetingService.updateTodo(todo.id, { version: todo.version, owner: '林岚', dueDate: '2026-11-09', status: 'in_progress' });
    const changed=await meetingService.detail(run.roots.meetings[0]);
    expect(changed.draft!.stale).toBe(true);
    const originalBody=changed.draft!.body;
    const preview=await meetingService.draftPreview(changed.draft!.id);
    expect(preview.body).toContain('林岚');expect(preview.body).toContain('2026-11-09');
    expect((await meetingService.detail(run.roots.meetings[0])).draft!.body).toBe(originalBody);
    await expect(meetingService.confirmDraft(changed.draft!.id,changed.draft!.version)).rejects.toMatchObject({code:'DRAFT_TODOS_STALE'});
    const draft = await meetingService.updateDraft(detail.draft!.id, { version: detail.draft!.version, recipients: ['reviewer@example.invalid'], subject: 'CORPUS人工编辑草稿', body: '仅用于草稿确认验收，不发送。' });
    expect((await meetingService.confirmDraft(draft.id, draft.version)).sent).toBe(false);
    await meetingService.reanalyze(run.roots.meetings[0]); await meetingService.processOne();
    detail = await meetingService.detail(run.roots.meetings[0]);
    expect(detail.versions).toHaveLength(2);
    expect(detail.todos.find(t => t.id === todo.id)).toMatchObject({ owner: '林岚', dueDate: '2026-11-09', status: 'in_progress', version: 2 });
    expect(detail.draft).toMatchObject({ subject: 'CORPUS人工编辑草稿', body: '仅用于草稿确认验收，不发送。', stale: true, deliveryState: 'not_sent' });
    await expect(meetingService.confirmDraft(draft.id, draft.version)).rejects.toMatchObject({ code: 'DRAFT_ANALYSIS_STALE' });
    await meetingService.reanalyze(run.roots.meetings[1]);
    const bad = createMeetingService(database, storage, stub('invalid-json'));
    await bad.processOne(); expect((await bad.detail(run.roots.meetings[1])).meeting).toMatchObject({ status: 'failed', errorCode: 'MEETING_INVALID_OUTPUT' });
  });
  testCase('T05', 'memory worker, evidence/foreign keys, idempotency and recall in another conversation', async () => {
    const source = (await chat().history(run.roots.conversations[0]))[0];
    await database.db.insert(schema.memoryJobs).values({ scope: run.scope, messageId: source.id });
    expect(await memory().processOne()).toBe(true); expect(await memory().processOne()).toBe(false);
    const saved = await memory().list(); expect(saved.memories).toHaveLength(3); expect(saved.jobs[0].status).toBe('ready');
    expect(saved.memories.every(m => m.sources[0].sourceId === source.id && m.sources[0].parentId === run.roots.conversations[0])).toBe(true);
    const candidates = await memory().retrieve('ORCHID-7421 林岚 地点 时间');
    expect(candidates.map(c => c.content)).toEqual(expect.arrayContaining(['南京', '林岚', '2026-11-06']));
    const selection = stub({ memoryIds: candidates.map(c => c.id) });
    const service = createChatService(database, selection, null, memory());
    await service.send(run.roots.conversations[1], { content: 'ORCHID-7421 林岚 地点 时间？', clientRequestId: randomUUID(), searchMode: 'off' });
    const last = (await service.history(run.roots.conversations[1])).at(-1)!;
    expect(last.memorySources).toHaveLength(3); expect(last.content).toContain('南京');
    // Do not leave extraction queued; the question has no asserted new facts.
    await createMemoryService(database, stub({ facts: [] }), embedder, run.scope).processOne();
    expect((await memory().list()).memories).toHaveLength(3);
    // Stage B BUG-03: a genuinely new conversation, PDF off/search off recalls memory;
    // PDF mode instead returns RAG evidence-gate output without entering memory retrieval.
    const freshId=randomUUID();run.roots.conversations.push(freshId);await saveRun(run);
    await database.db.insert(schema.conversations).values({id:freshId,title:`CORPUS-STUB ${run.runId} BUG-03 fresh`});
    const scopedMemory=memory(),retrieve=vi.spyOn(scopedMemory,'retrieve');
    const routing=createChatService(database,selection,createKnowledgeAnswerer(async()=>[]),scopedMemory);
    await routing.send(freshId,{content:'ORCHID-7421 林岚 地点 时间？',clientRequestId:randomUUID(),knowledgeMode:false,searchMode:'off'});
    expect((await routing.history(freshId)).at(-1)!.memorySources).toHaveLength(3);
    expect(retrieve).toHaveBeenCalledTimes(1);
    await routing.send(freshId,{content:'ORCHID-7421 林岚 地点 时间？',clientRequestId:randomUUID(),knowledgeMode:true,searchMode:'off'});
    expect((await routing.history(freshId)).at(-1)).toMatchObject({content:insufficientEvidence,memorySources:[]});
    expect(retrieve).toHaveBeenCalledTimes(1);
    for(let n=0;n<2;n++)await createMemoryService(database,stub({facts:[]}),embedder,run.scope).processOne();
  });
  testCase('T06', 'search modes, saved official URLs/query dates and provider failure status (STUB)', async () => {
    let calls = 0;
    const provider = { async search() { calls++; return web; } };
    const service = createChatService(database, stub(searchSelection), null, null, provider);
    for (const mode of ['required', 'auto', 'off'] as const) {
      await service.send(run.roots.conversations[0], { content: searchQuestion, clientRequestId: randomUUID(), searchMode: mode });
      const last = (await service.history(run.roots.conversations[0])).at(-1)!;
      if (mode === 'off') expect(last.webSources).toEqual([]);
      else expect(last.webSources.find(s => s.id === 'W2')).toMatchObject({ url: web[1].url, queriedAt: web[1].queriedAt, publishedAt: web[1].publishedAt });
    }
    await service.send(run.roots.conversations[0], { content: '什么是二分查找', clientRequestId: randomUUID(), searchMode: 'auto' }); expect(calls).toBe(2);
    const failed = createChatService(database, stub(searchSelection), null, null, { async search() { throw new Error('CORPUS_SEARCH_FAILURE'); } });
    await failed.send(run.roots.conversations[2], { content: searchQuestion, clientRequestId: randomUUID(), searchMode: 'required' });
    expect((await failed.history(run.roots.conversations[2])).at(-1)).toMatchObject({ status: 'failed', webSources: [] });
  });
  testCase('T07', 'conflict provenance persists without turning a proposal into a decision', async () => {
    const detail = await meetingService.detail(run.roots.meetings[0]);
    expect(detail.analysis!.result.decisions[0].value).toContain('2026-11-20'); expect(detail.analysis!.result.decisions[0].value).not.toContain('2026-11-27');
    expect(await meetingService.transcript(run.roots.meetings[0])).toContain('2026-11-27，尚未获批');
    const other = { ...web[1], id: 'W3', summary: 'The latest Active LTS is Node.js v24.0.0.' };
    const service = createChatService(database, stub({ ...searchSelection, citations: [...searchSelection.citations, { id: 'W3', quote: other.summary }] }), null, null, { async search() { return [web[1], other]; } });
    await service.send(run.roots.conversations[0], { content: searchQuestion, searchMode: 'required', clientRequestId: randomUUID() });
    const last = (await service.history(run.roots.conversations[0])).at(-1)!;
    expect(last.content).toContain('来源存在冲突'); expect(last.webSources).toHaveLength(2);
  });
  testCase('T08', 'PPT plan/file, concurrent workers, recovery, immutable version and process restart', async () => {
    const detail = await meetingService.detail(run.roots.meetings[0]);
    const todo = detail.todos.find(t => t.task === analysis.actions[0].task)!;
    const storedTodo = (await database.db.select().from(schema.meetingTodos).where(eq(schema.meetingTodos.id,todo.id)))[0];
    const savedMemory = (await memory().list()).memories[0];
    pptSources = structuredClone(goldenSources).map(s => s.id === 'P' ? { ...s, locator: { documentId: run.roots.documents[0], page: 2 } } : s.id === 'O' ? { ...s, locator: { documentId: run.roots.documents[1], page: 1 } } : s.id === 'T' ? { ...s, owner: todo.owner, dueDate: todo.dueDate, locator: { todoId: todo.id, todoVersion: todo.version, meetingId:storedTodo.meetingId,status:todo.status,userEdited:storedTodo.userEdited } } : s.id === 'L' ? { ...s, locator: { memoryId: savedMemory.id, evidence: savedMemory.sources[0].evidence } } : s.id === 'M' ? { ...s, locator: { meetingId: run.roots.meetings[0], evidence: detail.risks[0].evidence } } : s);
    const planner = vi.fn(async () => ({ model: 'CORPUS-STUB-PPT', content: JSON.stringify({ content: plan(5).slides.slice(1, -1).map(s => ({ items: s.items })) }) }));
    const config = { PPT_SCOPE: run.scope, PPT_MAX_TOKENS: 8192 };
    const ppt = createPresentationService(database, storage, { complete: planner }, async () => pptSources, config);
    const service = createChatService(database, stub('unused'), null, null, null, ppt);
    const input = { content: '根据ORCHID-7421资料生成5页管理汇报PPT，只引用Node.js官方网页来源', clientRequestId: randomUUID(), searchMode: 'off' as const };
    await service.send(run.roots.conversations[0], input); await service.send(run.roots.conversations[0], input);
    expect(await ppt.list()).toHaveLength(1); pptId = (await ppt.list())[0].id;
    const independent = configuredDatabase();
    try { const other = createPresentationService(independent, storage, { complete: planner }, async () => pptSources, config); await Promise.all([ppt.processOne(), other.processOne()]); }
    finally { await independent.pool.end(); }
    expect(planner).toHaveBeenCalledTimes(1); expect((await ppt.detail(pptId)).presentation.status).toBe('ready');
    const original = (await ppt.download(pptId)).bytes;
    expect((await validatePptx(original, 5)).slideCount).toBe(5);
    const archive = await JSZip.loadAsync(original);
    const savedTodoSlide = await archive.file('ppt/slides/slide4.xml')!.async('string');
    expect(savedTodoSlide).toContain('林岚'); expect(savedTodoSlide).toContain('2026-11-09');
    await database.db.update(schema.presentationJobs).set({ status: 'rendering', attempts: 1, leaseUntil: new Date(Date.now() - 1000) }).where(eq(schema.presentationJobs.id, pptId));
    await ppt.processOne(); expect(planner).toHaveBeenCalledTimes(1); expect(digest((await ppt.download(pptId)).bytes)).toBe(digest(original));
    // Exercise the existing one-amendment journal only on this run's own job.
    const row = (await database.db.select().from(schema.presentationJobs).where(eq(schema.presentationJobs.id, pptId)))[0];
    const revised = structuredClone(row.plan!); revised.slides[1].items[0] = { kind: 'recommendation', text: '建议先核实资料与交付依赖', sourceIds: ['M'] };
    const bytes = (await renderPresentation(revised, pptSources, row.topic, row.createdAt)).bytes;
    const publish = createRepairPublisher(database, storage, run.scope), revisionId = randomUUID();
    const request = { jobId: pptId, revisionId, parentSha: digest(original), plan: revised, bytes };
    expect((await publish(request)).state).toBe('published'); expect((await publish(request)).id).toBe(revisionId);
    expect(digest((await ppt.download(pptId)).bytes)).toBe(digest(bytes));
    expect(digest((await storage.get(row.objectKey)))).toBe(digest(original));
    await inventory(database, run);
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/corpus-restart.ts', run.runId], { encoding: 'utf8', timeout: 45000 });
    // Child prints only a sanitized summary; never forward raw process output.
    expect(child.status, 'Read-only restart verification process failed; no provider retries').toBe(0);
    expect(JSON.parse(child.stdout)).toMatchObject({ runId: run.runId, restored: true, pptDownloads: 1, externalCalls: 0 });
    await writeFile(resolve(runDirectory(run), 'restart-receipt.json'), child.stdout);
    expect((await database.db.select().from(schema.presentationJobs).where(eq(schema.presentationJobs.id, pptId)))[0].context.artifactPublication?.state).toBe('published');
    expect((await database.db.select().from(schema.documentChunks).where(inArray(schema.documentChunks.documentId, run.roots.documents))).length).toBeGreaterThan(0);
  });
  testCase('M03','chat PPT generation with no attachments and selected document/meeting uses real persisted pipeline',async()=>{
    const plainModel=stub({content:Array.from({length:3},()=>({items:[{kind:'recommendation',text:'沟通时通过复述确认双方理解一致',sourceIds:[]}]}))});
    const selectedModel:ChatModel={async complete(history){
      const payload=JSON.parse([...history].reverse().find(h=>h.role==="user")!.content);
      const pool=payload.untrustedSources.filter((s:any)=>["pdf","meeting_risk","todo"].includes(s.kind)&&s.quoteOptions.length);
      expect(["pdf","meeting_risk","todo"].every(kind=>pool.some((s:any)=>s.kind===kind))).toBe(true);
      const content=payload.contentSlots.map((slot:any,i:number)=>({items:slot.requiredQuotes?.length?slot.requiredQuotes.map((q:any)=>({kind:"quote",sourceId:q.sourceId,quote:q.quote})):[{kind:"recommendation",text:"建议核实资料中的交付依赖并同步进展",sourceIds:[]}]}));
      return {model:"CORPUS-STUB-V131",content:JSON.stringify({content})};
    }};
    const collector=createPresentationSources(database,null,null,null);
    for(const [count,model,context] of [[5,plainModel,{}],[10,selectedModel,{documentIds:[run.roots.documents[0]] as string[],meetingId:run.roots.meetings[0]}]] as const){
      const ppt=createPresentationService(database,storage,model,collector,{PPT_SCOPE:run.scope,PPT_MAX_TOKENS:8192});
      await createChatService(database,stub('unused'),null,null,null,ppt).send(run.roots.conversations[0],{content:`生成${count}页${count===5?'团队沟通培训':'管理层汇报'}PPT`,clientRequestId:randomUUID(),presentationContext:{meetingId:null,useMemory:false,webQuery:null,...context}});
      expect(await ppt.processOne()).toBe(true);const job=(await ppt.list())[0];expect(job.status).toBe('ready');const detail=await ppt.detail(job.id);
      expect((await validatePptx((await ppt.download(job.id)).bytes,count)).slideCount).toBe(count);
      if(count===5)expect(detail.sources?.map(s=>s.kind)).toEqual(['request']);
      else expect(detail.sources?.find(s=>s.kind==='todo'&&s.owner==='林岚')).toMatchObject({owner:'林岚',dueDate:'2026-11-09',locator:{userEdited:true}});
    }
  });
  testCase('M04','a manual todo changed during model planning prevents stale PPT publication',async()=>{
    const todo=(await database.db.select().from(schema.meetingTodos).where(eq(schema.meetingTodos.meetingId,run.roots.meetings[0]))).find(t=>t.userEdited)!;
    const planner=vi.fn(async(history:Parameters<ChatModel['complete']>[0])=>{
      const input=JSON.parse(history.find(m=>m.role==='user')!.content);
      const content=input.contentSlots.map((slot:any)=>({items:slot.requiredQuotes?.length?slot.requiredQuotes.map((q:any)=>({kind:'quote',sourceId:q.sourceId,quote:q.quote})):[{kind:'recommendation',text:'建议继续核实接口依赖并同步风险',sourceIds:[]}]}));
      // Only this Run's own synthetic todo is edited. No historical business row.
      await database.db.update(schema.meetingTodos).set({dueDate:'2026-11-10',version:todo.version+1,updatedAt:new Date()}).where(eq(schema.meetingTodos.id,todo.id));
      return {model:'CORPUS-STUB-CONCURRENT-EDIT',content:JSON.stringify({content})};
    });
    const ppt=createPresentationService(database,storage,{complete:planner},createPresentationSources(database,null,null,null),{PPT_SCOPE:run.scope,PPT_MAX_TOKENS:8192});
    await createChatService(database,stub('unused'),null,null,null,ppt).send(run.roots.conversations[0],{content:'根据所选PDF和会议生成10页管理汇报PPT，保留人工待办',clientRequestId:randomUUID(),presentationContext:{documentIds:[run.roots.documents[0]],meetingId:run.roots.meetings[0],useMemory:false,webQuery:null}});
    await ppt.processOne();const job=(await ppt.list())[0];
    expect(planner).toHaveBeenCalledTimes(1);expect(job).toMatchObject({status:'failed',errorCode:'PPT_TODO_SOURCE_CHANGED'});
    await expect(ppt.download(job.id)).rejects.toMatchObject({code:'PPT_NOT_READY'});
  });
  testCase('M01','authenticated archive/rename/remove/ignore retain old evidence and files',async()=>{
    const objectsBefore=structuredClone(run.objects);
    const key='synthetic-management-access-1234567890';
    const app=Fastify();registerDemoAccess(app,parseEnv({NODE_ENV:'test',DEMO_ACCESS_KEY:key}));registerManagementRoutes(app,database);
    app.setErrorHandler((e,_r,reply)=>reply.code(e instanceof PublicError?e.statusCode:500).send({code:e instanceof PublicError?e.code:'TEST_ERROR'}));
    try{
      const target=run.roots.conversations[0];
      expect((await app.inject({method:'DELETE',url:`/api/conversations/${target}`})).statusCode).toBe(401);
      const login=await app.inject({method:'POST',url:'/api/demo-session',payload:{accessKey:key}});const cookie=String(login.headers['set-cookie']).split(';')[0];
      const request=(method:'PATCH'|'DELETE'|'POST',url:string,payload?:Record<string,unknown>)=>app.inject({method,url,headers:{cookie},payload});
      expect((await request('PATCH',`/api/conversations/${target}`,{title:`CORPUS renamed ${run.runId}`})).statusCode).toBe(200);
      expect((await database.db.select().from(schema.conversations).where(eq(schema.conversations.id,target)))[0].title).toContain('CORPUS renamed');
      const oldHistory=await chat().history(target);
      expect((await request('DELETE',`/api/conversations/${target}`)).statusCode).toBe(200);
      expect((await chat().list()).some(c=>c.id===target)).toBe(false);
      expect(await chat().history(target)).toHaveLength(oldHistory.length);
      await expect(chat().send(target,{content:'不能向归档会话写入',clientRequestId:randomUUID(),searchMode:'off'})).rejects.toMatchObject({code:'CONVERSATION_NOT_FOUND'});
      expect(await memory().retrieve('ORCHID-7421 林岚')).toEqual([]);
      const document=run.roots.documents[0];
      expect((await request('DELETE',`/api/documents/${document}`)).statusCode).toBe(200);
      const docs=createDocumentService(database,storage,embedder);
      expect((await docs.list()).some(d=>d.id===document)).toBe(false);
      expect((await docs.download(document)).bytes.length).toBeGreaterThan(0);
      expect((await createRetriever(database,embedder,0.5)('code')).some(d=>d.documentId===document)).toBe(false);
      const detail=await meetingService.detail(run.roots.meetings[0]),todo=detail.todos.find(t=>t.task===analysis.actions[0].task)!;
      expect((await request('POST',`/api/meeting-todos/${todo.id}/ignore`,{version:todo.version})).statusCode).toBe(200);
      expect((await meetingService.detail(run.roots.meetings[0])).todos.find(t=>t.id===todo.id)?.ignored).toBe(true);
      expect((await meetingService.draftPreview(detail.draft!.id)).body).not.toContain(todo.task);
      expect((await request('POST',`/api/meeting-todos/${todo.id}/ignore`,{version:todo.version})).statusCode).toBe(409);
      const row=(await database.db.select().from(schema.presentationJobs).where(eq(schema.presentationJobs.id,pptId)))[0];
      const collected=await createPresentationSources(database,createRetriever(database,embedder,0.5),memory(),null)({...row,request:'根据这次会议生成5页PPT',context:{...row.context,meetingId:run.roots.meetings[0],documentIds:[run.roots.documents[1]],knowledgeMode:true,useMemory:true,searchMode:'off',webQuery:null}});
      expect(collected.filter(s=>s.kind==='todo').some(s=>s.locator.todoId===todo.id)).toBe(false);
      expect(collected.filter(s=>s.kind==='pdf').some(s=>s.locator.documentId===document)).toBe(false);
      const download=createPresentationService(database,storage,stub('unused'),async()=>[],{PPT_SCOPE:run.scope,PPT_MAX_TOKENS:8192});
      expect(digest((await download.download(pptId)).bytes)).toBe(row.sha256);
      expect(run.objects).toEqual(objectsBefore);
    }finally{await app.close();}
  });
  testCase('M02','V1.2 selected PDF scope and meeting archive preserve history, drafts and downloads',async()=>{
    const objectsBefore=structuredClone(run.objects);
    const retrieve=createRetriever(database,embedder,0.5),selected=run.roots.documents[1],removed=run.roots.documents[0];
    expect(await retrieve('项目',[])).toEqual([]);expect(await retrieve('项目',[removed])).toEqual([]);
    const scoped=await retrieve('项目',[selected]);expect(scoped.length).toBeGreaterThan(0);expect(scoped.every(s=>s.documentId===selected)).toBe(true);
    const key='synthetic-v12-management-secret-123456789';
    const app=Fastify();registerDemoAccess(app,parseEnv({NODE_ENV:'test',DEMO_ACCESS_KEY:key}));registerManagementRoutes(app,database);
    try{
      const meetingId=run.roots.meetings[0],before=await meetingService.detail(meetingId),text=await meetingService.transcript(meetingId);
      expect((await app.inject({method:'DELETE',url:`/api/meetings/${meetingId}`})).statusCode).toBe(401);
      const login=await app.inject({method:'POST',url:'/api/demo-session',payload:{accessKey:key}});const cookie=String(login.headers['set-cookie']).split(';')[0];
      expect((await app.inject({method:'DELETE',url:`/api/meetings/${meetingId}`,headers:{cookie}})).statusCode).toBe(200);
      expect((await meetingService.list()).some(m=>m.id===meetingId)).toBe(false);
      expect(await meetingService.detail(meetingId)).toEqual(before);expect(await meetingService.transcript(meetingId)).toBe(text);
      await expect(meetingService.reanalyze(meetingId)).rejects.toBeDefined();
      const row=(await database.db.select().from(schema.presentationJobs).where(eq(schema.presentationJobs.id,pptId)))[0];
      await expect(createPresentationSources(database,retrieve,memory(),null)({...row,context:{...row.context,meetingId}})).rejects.toMatchObject({code:'PPT_MEETING_NOT_READY'});
      const independent=configuredDatabase();try{
        const restored=createMeetingService(independent,storage,null);
        expect((await restored.list()).some(m=>m.id===meetingId)).toBe(false);expect(await restored.transcript(meetingId)).toBe(text);
        expect(digest((await createPresentationService(independent,storage,stub('unused'),async()=>[],{PPT_SCOPE:run.scope,PPT_MAX_TOKENS:8192}).download(pptId)).bytes)).toBe(row.sha256);
      }finally{await independent.pool.end();}
      // Only this run's pre-registered meeting; prove new worker claims exclude archives.
      await database.db.update(schema.meetings).set({status:'uploaded',attempts:0}).where(eq(schema.meetings.id,meetingId));
      expect(await meetingService.processOne()).toBe(false);expect(run.objects).toEqual(objectsBefore);
    }finally{await app.close();}
  });
});
