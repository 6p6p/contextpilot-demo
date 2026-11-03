import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { createDatabase } from '../../apps/api/src/db/client.js';
import { documents, documentChunks } from '../../apps/api/src/db/schema.js';
import { createDocumentService } from '../../apps/api/src/knowledge/service.js';
import { createRetriever } from '../../apps/api/src/knowledge/retrieval.js';
import type { PrivateStorage } from '../../apps/api/src/knowledge/storage.js';
import type { Embedder } from '../../apps/api/src/knowledge/embedding.js';
import { recordAcceptance } from '../../scripts/acceptance-manifest.js';

// Real PostgreSQL/pgvector/PDF.js. Storage and embeddings explicitly STUBBED.
// No cloud Storage or embedding/LLM calls; test records retained, not deleted.
describe('PDF persistence and real pgvector with stub external APIs', () => {
  let database: NonNullable<ReturnType<typeof createDatabase>>;
  const objects = new Map<string, Buffer>();
  const storage: PrivateStorage = { origin: 'https://integration.invalid', bucket: 'stub-private', async put(key, bytes) { objects.set(key, bytes); }, async get(key) { if (!objects.has(key)) throw new Error('missing synthetic object'); return objects.get(key)!; } };
  const embedder: Embedder = { space: `synthetic-${randomUUID()}`, dimensions: 3, async embed(texts) { return texts.map(() => [1, 0, 0]); } };
  beforeAll(() => {
    if (process.env.RUN_LIVE_TESTS !== '1') throw new Error('Requires RUN_LIVE_TESTS=1 and authorized real database');
    const configured = createDatabase(parseEnv(process.env));
    if (!configured) throw new Error('Database must be configured');
    database = configured;
  });
  afterAll(async () => { await database?.pool.end(); });
  it('persists page metadata and vectors; retrieves multiple documents in actual SQL', async () => {
    const service = createDocumentService(database, storage, embedder);
    const first = await service.upload('synthetic-project.pdf', 'application/pdf', await readFile('tests/fixtures/rag-project.pdf'));
    const second = await service.upload('synthetic-owner.pdf', 'application/pdf', await readFile('tests/fixtures/rag-owner.pdf'));
    await service.processOne(); await service.processOne();
    expect(await service.get(first.id)).toMatchObject({ status: 'ready', pageCount: 2, chunkCount: 2 });
    expect(await service.get(second.id)).toMatchObject({ status: 'ready', pageCount: 2 });
    const retrieved = await createRetriever(database, embedder, 0.5)('unique project facts');
    expect(new Set(retrieved.map(s => s.documentId))).toEqual(new Set([first.id, second.id]));
    expect(retrieved.find(s => s.text.includes('AMBER-593'))?.page).toBe(2);
    const fresh = createDatabase(parseEnv(process.env))!;
    try { expect(await createDocumentService(fresh, storage, embedder).get(first.id)).toMatchObject({ status: 'ready' }); }
    finally { await fresh.pool.end(); }
  });
  it('persists failures and never publishes chunks for blank/corrupt PDFs', async () => {
    const service = createDocumentService(database, storage, embedder);
    for (const [name, bytes, expected] of [
      ['blank.pdf', await readFile('tests/fixtures/rag-no-text.pdf'), 'PDF_NO_TEXT'],
      ['damaged.pdf', Buffer.from('%PDF-1.7 broken'), 'PDF_PARSE_FAILED'],
    ] as const) {
      const uploaded = await service.upload(name, 'application/pdf', bytes);
      await service.processOne();
      expect(await service.get(uploaded.id)).toMatchObject({ status: 'failed', errorCode: expected, chunkCount: 0 });
      expect(await database.db.select().from(documentChunks).where(eq(documentChunks.documentId, uploaded.id))).toHaveLength(0);
    }
  });
  it('recovers an expired lease from durable state', async () => {
    const service = createDocumentService(database, storage, embedder);
    const row = await service.upload('recover.pdf', 'application/pdf', await readFile('tests/fixtures/rag-project.pdf'));
    await database.db.update(documents).set({ status: 'processing', attempts: 1, leaseToken: randomUUID(), leaseUntil: new Date(Date.now() - 60000) }).where(eq(documents.id, row.id));
    await createDocumentService(database, storage, embedder).processOne();
    expect(await service.get(row.id)).toMatchObject({ status: 'ready' });
  });
  it('preserves interrupted work on shutdown and resumes after lease expiry', async () => {
    const shutdown = new AbortController();
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const heldEmbedder: Embedder = { ...embedder, async embed() {
      entered();
      return new Promise((_resolve, reject) => shutdown.signal.addEventListener('abort', () => reject(new Error('synthetic cancellation')), { once: true }));
    } };
    const service = createDocumentService(database, storage, heldEmbedder, shutdown.signal);
    const row = await service.upload('shutdown-acceptance.pdf', 'application/pdf', await readFile('tests/fixtures/rag-project.pdf'));
    await recordAcceptance('documents', row.id);
    const processing = service.processOne();
    await started;
    shutdown.abort();
    expect(await processing).toBe(false);
    expect(await service.get(row.id)).toMatchObject({ status: 'processing', chunkCount: 0 });
    await database.db.update(documents).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(documents.id, row.id));
    await createDocumentService(database, storage, embedder).processOne();
    expect(await service.get(row.id)).toMatchObject({ status: 'ready', chunkCount: 2 });
  });
});
