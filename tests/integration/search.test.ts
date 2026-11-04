import 'dotenv/config';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { createDatabase } from '../../apps/api/src/db/client.js';
import { createChatService } from '../../apps/api/src/chat/service.js';
import { PublicError } from '../../apps/api/src/errors.js';
// REAL PostgreSQL only. Search and LLM are explicit stubs; no provider acceptance.
describe('search persistence: real DB / stub external', () => {
  let db: NonNullable<ReturnType<typeof createDatabase>>;
  beforeAll(() => { if (process.env.RUN_LIVE_TESTS !== '1') throw new Error('Requires separate DB authorization'); db = createDatabase(parseEnv(process.env))!; if (!db) throw new Error('DB required'); });
  afterAll(async () => { await db?.pool.end(); });
  it('routes auto/required/off, restores citations, deduplicates and persists failures', async () => {
    const source = { id: 'W1', title: 'STUB source', url: 'https://example.org/', summary: 'STUB fact', quote: '', queriedAt: new Date().toISOString(), publishedAt: null };
    const search = vi.fn().mockResolvedValue([source]);
    const complete = vi.fn().mockResolvedValue({ content: '{"citations":[{"id":"W1","quote":"STUB fact"}]}', model: 'STUB' });
    const service = createChatService(db, { complete }, null, null, { search });
    const c = await service.create('Phase7 STUB search DB acceptance');
    const input = { content: '最新版本', clientRequestId: randomUUID(), searchMode: 'auto' as const };
    const rows = await service.send(c.id, input);
    expect(rows[1].webSources[0]).toMatchObject({ url: source.url, quote: 'STUB fact', publishedAt: null });
    await service.send(c.id, input); expect(search).toHaveBeenCalledTimes(1);
    await expect(service.send(c.id, { ...input, searchMode: 'off' })).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' });
    const independent = createDatabase(parseEnv(process.env))!;
    try { expect((await createChatService(independent, null).history(c.id))[1].webSources).toEqual(rows[1].webSources); } finally { await independent.pool.end(); }
    await service.send(c.id, { content: '最新版本', searchMode: 'off', clientRequestId: randomUUID() }); expect(search).toHaveBeenCalledTimes(1);
    await service.send(c.id, { content: '解释二分查找', searchMode: 'auto', clientRequestId: randomUUID() }); expect(search).toHaveBeenCalledTimes(1);
    await service.send(c.id, { content: '二分查找', searchMode: 'required', clientRequestId: randomUUID() }); expect(search).toHaveBeenCalledTimes(2);
    search.mockRejectedValue(new PublicError(502, 'SEARCH_RATE_LIMITED', 'stub failure'));
    const failed = await service.send(c.id, { content: '最新版本', searchMode: 'required', clientRequestId: randomUUID() });
    expect(failed[1]).toMatchObject({ status: 'failed', errorCode: 'SEARCH_RATE_LIMITED', webSources: [] });
  });
  it('persists unavailable/timeout/invalid-citation/blocked failures and empty results truthfully', async () => {
    const model = { complete: vi.fn().mockResolvedValue({ content: '{"citations":[{"id":"invented","quote":"fake"}]}', model: 'STUB' }) };
    async function run(provider: Parameters<typeof createChatService>[4], content = '最新版本') {
      const service = createChatService(db, model, null, null, provider);
      const c = await service.create('Phase7 STUB failure boundary');
      return (await service.send(c.id, { content, searchMode: 'required', clientRequestId: randomUUID() }))[1];
    }
    expect(await run(null)).toMatchObject({ status: 'failed', errorCode: 'SEARCH_NOT_CONFIGURED', webSources: [] });
    expect(await run({ async search() { throw new PublicError(502, 'SEARCH_TIMEOUT', 'stub timeout'); } })).toMatchObject({ status: 'failed', errorCode: 'SEARCH_TIMEOUT', webSources: [] });
    expect(await run({ async search() { return []; } })).toMatchObject({ status: 'completed', content: '真实搜索未找到可用来源，无法确认最新信息。', webSources: [] });
    const search = vi.fn().mockResolvedValue([{ id: 'W1', title: 'STUB', url: 'https://example.org/', summary: 'actual', queriedAt: new Date().toISOString(), publishedAt: null, quote: '' }]);
    expect(await run({ search })).toMatchObject({ status: 'failed', errorCode: 'SEARCH_INVALID_CITATION', webSources: [] });
    expect(await run({ search }, '会议内部最新计划')).toMatchObject({ status: 'failed', errorCode: 'SEARCH_QUERY_BLOCKED', webSources: [] });
    expect(search).toHaveBeenCalledTimes(1);
  }, 90000);

});
