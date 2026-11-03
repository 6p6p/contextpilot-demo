import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { createDatabase } from '../../apps/api/src/db/client.js';
import { createChatService } from '../../apps/api/src/chat/service.js';
import { messages } from '../../apps/api/src/db/schema.js';

// REAL PostgreSQL, explicitly STUBBED model: tests transactions without billing.
// Retains isolated acceptance records; no truncation/drop/delete.
describe('real PostgreSQL persistence and concurrency (stub model)', () => {
  let database: NonNullable<ReturnType<typeof createDatabase>>;
  beforeAll(() => {
    if (process.env.RUN_LIVE_TESTS !== '1') throw new Error('Set RUN_LIVE_TESTS=1 only after authorizing real database acceptance.');
    const configured = createDatabase(parseEnv(process.env));
    if (!configured) throw new Error('DATABASE_URL is required');
    database = configured;
  });
  afterAll(async () => { await database?.pool.end(); });
  it('persists across independent connections; deduplicates request IDs', async () => {
    let calls = 0;
    const service = createChatService(database, { async complete() { calls++; return { content: 'stub reply for transaction test', model: 'test-stub' }; } });
    const conversation = await service.create(`DB acceptance ${Date.now()}`);
    const input = { content: 'persistence acceptance record', clientRequestId: randomUUID() };
    await service.send(conversation.id, input);
    await service.send(conversation.id, input);
    expect(calls).toBe(1);
    const independent = createDatabase(parseEnv(process.env))!;
    try {
      const saved = await createChatService(independent, null).history(conversation.id);
      expect(saved).toHaveLength(2);
      expect(saved.map(m => m.status)).toEqual(['completed', 'completed']);
    } finally { await independent.pool.end(); }
    await expect(service.send(conversation.id, { ...input, content: 'different content' })).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' });
  });
  it('blocks concurrent turns, preserves failures, recovers interrupted status', async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const service = createChatService(database, { async complete() { entered(); await held; throw new Error('synthetic failure'); } });
    const conversation = await service.create(`Concurrency acceptance ${Date.now()}`);
    const first = service.send(conversation.id, { content: 'first', clientRequestId: randomUUID() });
    try {
      await started;
      await expect(service.send(conversation.id, { content: 'second', clientRequestId: randomUUID() })).rejects.toMatchObject({ code: 'CONVERSATION_BUSY' });
    } finally { release(); }
    await first;
    let saved = await service.history(conversation.id);
    expect(saved[1]).toMatchObject({ status: 'failed', errorCode: 'GENERATION_FAILED' });
    await database.db.update(messages).set({ status: 'processing', createdAt: new Date(Date.now() - 120000) }).where(eq(messages.id, saved[1].id));
    saved = await service.history(conversation.id);
    expect(saved[1]).toMatchObject({ status: 'failed', errorCode: 'GENERATION_INTERRUPTED' });
  });
});
