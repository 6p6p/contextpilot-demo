import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../../apps/api/src/db/client.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { createMemoryService } from '../../apps/api/src/memory/service.js';
import { createChatService } from '../../apps/api/src/chat/service.js';
import { memoryJobs, memories, messages, meetings, meetingAnalyses } from '../../apps/api/src/db/schema.js';
import type { ChatModel } from '../../apps/api/src/llm/adapter.js';
import type { ExtractedMemory } from '../../shared/memory.js';

describe('durable memory (REAL PostgreSQL/pgvector, MOCK LLM/Embedding/Storage)', () => {
  let database: NonNullable<ReturnType<typeof createDatabase>>;
  const scope = `test-${randomUUID()}`;
  const text = '林岚负责星桥ABCD1234项目。地点是南京。原定11月5日，改为11月8日。';
  const kinds: [ExtractedMemory['kind'], string][] = [['person','林岚'],['place','南京'],['topic','星桥ABCD1234项目'],['time','11月5日'],['time','11月8日']];
  const model: ChatModel = { async complete() { return { content: JSON.stringify({ facts: kinds.map(([kind, content]) => ({ kind, content, evidence: { startLine: 1, endLine: 1, quote: kind === 'place' ? '地点是南京' : kind === 'time' ? `原定11月5日，改为11月8日` : text } })) }), model: 'mock' }; } };
  const embedder = { space: scope, dimensions: 3, async embed(texts: string[]) { return texts.map(() => [1, 0, 0]); } };
  beforeAll(() => { if (process.env.RUN_LIVE_TESTS !== '1') throw new Error('Requires authorized real DB'); database = createDatabase(parseEnv(process.env))!; });
  afterAll(async () => { await database?.pool.end(); });
  it('persists provenance, deduplicates repeated sources, recalls from new chat and new pool, isolates scopes and keeps conflicts', async () => {
    const memory = createMemoryService(database, model, embedder, scope);
    const chat = createChatService(database, { async complete() { return { content: '已收到', model: 'mock' }; } }, null, memory);
    const conversation = await chat.create('memory-DB-test');
    const send = () => chat.send(conversation.id, { content: text, clientRequestId: randomUUID() });
    const first = await send(); await memory.processOne(); await send(); await memory.processOne();
    let list = await memory.list(); expect(list.memories).toHaveLength(5); expect(list.memories.every(m => m.sources.length === 2)).toBe(true);
    const job = (await database.db.select().from(memoryJobs).where(and(eq(memoryJobs.scope, scope), eq(memoryJobs.messageId, first[0].id))))[0];
    await database.db.update(memoryJobs).set({ status: 'queued', attempts: 0 }).where(eq(memoryJobs.id, job.id));
    await memory.processOne(); expect((await memory.list()).memories).toHaveLength(5);
    const sameName = '林岚在苏州负责海桥ABCD1234试点项目，日期未知。';
    const otherConversation = await chat.create('same-name-distinct-context');
    const rows = await chat.send(otherConversation.id, { content: sameName, clientRequestId: randomUUID() });
    const secondMemory = createMemoryService(database, { async complete() { return { content: JSON.stringify({ facts: ['林岚', '苏州', '试点项目', '日期未知'].map((content, i) => ({ kind: ['person','place','topic','event'][i], content, evidence: { startLine: 1, endLine: 1, quote: sameName } })) }), model: 'mock' }; } }, embedder, scope);
    await secondMemory.processOne(); list = await memory.list(); expect(list.memories.filter(m => m.content === '林岚')).toHaveLength(2);
    expect(list.memories.find(m => m.sources.some(s => s.sourceId === rows[0].id))!.sources[0].parentId).toBe(otherConversation.id);
    const fresh = createDatabase(parseEnv(process.env))!;
    try {
      const restarted = createMemoryService(fresh, model, embedder, scope);
      const semantic = await restarted.retrieve('semantic-probe-no-lexical-overlap');
      expect(semantic.length).toBeGreaterThan(0); expect(semantic.length).toBeLessThanOrEqual(6);
      expect((await restarted.retrieve('星桥ABCD1234项目日期')).filter(m => m.kind === 'time')).toHaveLength(2);
      expect((await createMemoryService(fresh, model, embedder, `foreign-${scope}`).retrieve('林岚'))).toEqual([]);
      const newChat = createChatService(fresh, { async complete(input) { const data = JSON.parse(input.at(-1)!.content); return { content: JSON.stringify({ memoryIds: data.memories.map((m: {id:string}) => m.id) }), model: 'mock-selector' }; } }, null, restarted);
      const next = await newChat.create('new-session');
      const answer = await newChat.send(next.id, { content: '星桥ABCD1234项目日期', clientRequestId: randomUUID() });
      expect(answer[1].content).toContain('11月5日'); expect(answer[1].content).toContain('11月8日'); expect(answer[1].memorySources.length).toBeGreaterThan(0);
    } finally { await fresh.pool.end(); }
  }, 120000);
  it('retains conflicting dates from separate user messages with separate provenance', async () => {
    const localScope = `dates-${scope}`;
    const memory = createMemoryService(database, { async complete(input) {
      const quote = JSON.parse(input.at(-1)!.content).untrustedLines[0].text as string;
      return { model: 'mock', content: JSON.stringify({ facts: [{ kind: 'time', content: quote.match(/11月\d+日/)![0], evidence: { startLine: 1, endLine: 1, quote } }] }) };
    } }, null, localScope);
    const chat = createChatService(database, { async complete() { return { content: 'saved', model: 'mock' }; } }, null, memory);
    const c = await chat.create('conflicting-source-dates');
    const one = await chat.send(c.id, { content: '北桥项目原定11月5日', clientRequestId: randomUUID() }); await memory.processOne();
    const two = await chat.send(c.id, { content: '北桥项目改为11月8日', clientRequestId: randomUUID() }); await memory.processOne();
    const result = await memory.retrieve('北桥项目日期'); expect(result).toHaveLength(2);
    expect(new Set(result.flatMap(m => m.sources.map(s => s.sourceId)))).toEqual(new Set([one[0].id, two[0].id]));
  }, 90000);
  it('fences expired memory workers and rolls back failed publication', async () => {
    const localScope = `lease-${scope}`;
    let enter!: () => void, release!: () => void;
    const started = new Promise<void>(r => { enter = r; });
    const held = new Promise<void>(r => { release = r; });
    let calls = 0;
    const heldModel: ChatModel = { async complete(input) { calls++; enter(); await held; return model.complete(input); } };
    const first = createMemoryService(database, heldModel, embedder, localScope);
    const chat = createChatService(database, { async complete() { return { content: '保存', model: 'stub' }; } }, null, first);
    const c = await chat.create('lease-memory'); const rows = await chat.send(c.id, { content: text, clientRequestId: randomUUID() });
    const other = createDatabase(parseEnv(process.env))!;
    const second = createMemoryService(other, model, embedder, localScope);
    const running = first.processOne();
    try {
      await started; expect(await second.processOne()).toBe(false);
      await database.db.update(memoryJobs).set({ leaseUntil: new Date(Date.now() - 1000) }).where(and(eq(memoryJobs.scope, localScope), eq(memoryJobs.messageId, rows[0].id)));
      expect(await second.processOne()).toBe(true);
    } finally { release(); await running; await other.pool.end(); }
    expect(calls).toBe(1); expect((await first.list()).memories).toHaveLength(5);
    expect((await first.list()).jobs[0].status).toBe('ready');
    // Force embedding failure after extraction: no facts are partially published.
    const badScope = `embedding-${scope}`;
    const failing = createMemoryService(database, model, { ...embedder, async embed() { throw new Error('stub embedding failure'); } }, badScope);
    await database.db.insert(memoryJobs).values({ scope: badScope, messageId: rows[0].id });
    await failing.processOne(); expect((await failing.list()).memories).toHaveLength(0);
    expect((await failing.list()).jobs[0].status).toBe('failed');
  }, 90000);
  it('extracts meeting decisions without model guesses; extraction failure preserves source chat', async () => {
    const id = randomUUID(); const transcript = '决定开展海桥试点。'; const evidence = { startLine: 1, endLine: 1, quote: transcript };
    await database.db.insert(meetings).values({ id, filename: 'memory-test.txt', sha256: randomUUID(), size: 1, objectKey: id, storageOrigin: 'https://memory.invalid', storageBucket: 'stub', transcript, lineCount: 1, status: 'ready' });
    const [analysis] = await database.db.insert(meetingAnalyses).values({ meetingId: id, version: 1, model: 'stub', result: { topic: null, location: null, meetingDate: null, participants: [], topics: [], decisions: [{ value: '开展海桥试点', evidence }], actions: [{ task: '开展海桥试点', owner: null, dueDate: null, evidence }], risks: [] } }).returning();
    const localScope = `meeting-${scope}`;
    const memory = createMemoryService(database, model, embedder, localScope);
    await database.db.insert(memoryJobs).values({ scope: localScope, analysisId: analysis.id }).onConflictDoNothing(); await memory.processOne();
    expect((await memory.retrieve('海桥试点')).some(m => m.kind === 'decision' && m.sources[0].parentId === id)).toBe(true);
    const bad = createMemoryService(database, { async complete() { throw new Error('synthetic failure'); } }, null, localScope);
    const chat = createChatService(database, { async complete() { return { content: 'source-safe', model: 'stub' }; } }, null, bad);
    const c = await chat.create('failed-extraction'); const rows = await chat.send(c.id, { content: '原始消息保留', clientRequestId: randomUUID() }); await bad.processOne();
    expect((await bad.list()).jobs.some(j => j.sourceId === rows[0].id && j.status === 'failed')).toBe(true);
    expect((await chat.history(c.id)).map(m => m.content)).toEqual(['原始消息保留', 'source-safe']);
  }, 90000);
});
