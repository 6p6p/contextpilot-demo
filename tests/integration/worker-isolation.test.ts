import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../../apps/api/src/db/client.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { documents, meetings } from '../../apps/api/src/db/schema.js';
import { createMeetingService } from '../../apps/api/src/meetings/service.js';
import { createDocumentService } from '../../apps/api/src/knowledge/service.js';
import type { PrivateStorage } from '../../apps/api/src/knowledge/storage.js';

// Real PostgreSQL; all external services are stubs. Unique records retained.
describe('worker isolation and atomic claiming (real PostgreSQL, stub providers)', () => {
  let database: NonNullable<ReturnType<typeof createDatabase>>;
  let other: typeof database;
  const origin = `https://${randomUUID()}.invalid`;
  const objects = new Map<string, Buffer>();
  const storage: PrivateStorage = { origin, bucket: 'worker-test', async put(key, bytes) { objects.set(key, bytes); }, async get(key) { return objects.get(key)!; } };
  const result = JSON.stringify({ topic: null, meetingDate: null, location: null, participants: [], topics: [], decisions: [], risks: [], actions: [] });
  beforeAll(() => {
    if (process.env.RUN_LIVE_TESTS !== '1') throw new Error('Requires authorized real database');
    database = createDatabase(parseEnv(process.env))!;
    other = createDatabase(parseEnv(process.env))!;
  });
  afterAll(async () => { await Promise.all([database?.pool.end(), other?.pool.end()]); });
  it('does not expire another storage scope or embedding space', async () => {
    const old = new Date(Date.now() - 600000);
    for (const status of ['uploaded', 'processing'] as const) {
      const id = randomUUID();
      await database.db.insert(meetings).values({ id, filename: 'scope-test.txt', sha256: randomUUID(), size: 1, objectKey: id, storageOrigin: `${origin}/foreign`, storageBucket: storage.bucket, transcript: '测试', lineCount: 1, status, attempts: 2, leaseUntil: old, createdAt: old });
      await createMeetingService(database, storage, { async complete() { throw new Error('Unexpected model call'); } }).processOne();
      expect((await database.db.select().from(meetings).where(eq(meetings.id, id)))[0].status).toBe(status);
      for (const foreign of ['origin', 'bucket', 'space']) {
        const docId = randomUUID();
        await database.db.insert(documents).values({ id: docId, filename: 'scope-test.pdf', size: 1, sha256: randomUUID(), objectKey: docId, storageOrigin: foreign === 'origin' ? `${origin}/foreign` : origin, storageBucket: foreign === 'bucket' ? 'foreign' : storage.bucket, embeddingSpace: foreign === 'space' ? 'foreign' : origin, dimensions: 3, status, attempts: 2, leaseUntil: old, createdAt: old });
        await createDocumentService(database, storage, { space: origin, dimensions: 3, async embed() { throw new Error('Unexpected embedding call'); } }).processOne();
        expect((await database.db.select().from(documents).where(eq(documents.id, docId)))[0].status).toBe(status);
      }
    }
  }, 90000);
  it('claims once across independent pools and fences a worker after lease takeover', async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const first = createMeetingService(database, storage, { async complete() { calls++; entered(); await held; return { content: result, model: 'old-stub' }; } });
    const second = createMeetingService(other, storage, { async complete() { calls++; return { content: result, model: 'new-stub' }; } });
    const uploaded = await first.upload('claim-test.txt', 'text/plain', Buffer.from(`测试 ${randomUUID()}`));
    const running = first.processOne();
    try {
      await started;
      expect(await second.processOne()).toBe(false);
      expect(calls).toBe(1);
      // Simulate lost heartbeat: takeover may repeat a provider call, but old owner cannot publish.
      await database.db.update(meetings).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(meetings.id, uploaded.meeting.id));
      expect(await second.processOne()).toBe(true);
    } finally { release(); await running; }
    const detail = await first.detail(uploaded.meeting.id);
    expect(calls).toBe(2);
    expect(detail.versions).toHaveLength(1);
    expect(detail.analysis?.model).toBe('new-stub');
    expect(detail.meeting.status).toBe('ready');
  }, 90000);
});
