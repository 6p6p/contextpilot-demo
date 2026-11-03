import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import type { createDatabase } from '../db/client.js';
import { documents, documentChunks } from '../db/schema.js';
import { PublicError } from '../errors.js';
import type { PrivateStorage } from './storage.js';
import type { Embedder } from './embedding.js';
import { chunkPages, parsePdf, validatePdf } from './pdf.js';

export type Database = NonNullable<ReturnType<typeof createDatabase>>;
const publicFields = {
  id: documents.id, filename: documents.filename, size: documents.size, status: documents.status,
  pageCount: documents.pageCount, chunkCount: documents.chunkCount, errorCode: documents.errorCode, errorMessage: documents.errorMessage,
  createdAt: documents.createdAt, updatedAt: documents.updatedAt,
};
export function createDocumentService(database: Database, storage: PrivateStorage | null, embedder: Embedder | null, shutdownSignal?: AbortSignal) {
  const db = database.db;
  async function get(id: string) {
    const [row] = await db.select(publicFields).from(documents).where(eq(documents.id, id));
    if (!row) throw new PublicError(404, 'DOCUMENT_NOT_FOUND', '文件不存在。');
    return row;
  }
  async function download(id: string) {
    if (!storage) throw new PublicError(503, 'STORAGE_NOT_CONFIGURED', '尚未配置私有 Storage。');
    const [row] = await db.select().from(documents).where(eq(documents.id, id));
    if (!row) throw new PublicError(404, 'DOCUMENT_NOT_FOUND', '文件不存在。');
    if (!row.storageReady) throw new PublicError(409, 'DOCUMENT_NOT_STORED', '原始文件尚未保存成功。');
    if (row.storageOrigin !== storage.origin || row.storageBucket !== storage.bucket) throw new PublicError(503, 'STORAGE_CONFIG_CHANGED', '文件存储配置已变化。');
    return { filename: row.filename, bytes: await storage.get(row.objectKey) };
  }
  return {
    get, download,
    list: () => db.select(publicFields).from(documents).orderBy(desc(documents.createdAt)).limit(100),
    async upload(filename: string, mime: string, bytes: Buffer) {
      validatePdf(filename, mime, bytes);
      if (!storage || !embedder) throw new PublicError(503, 'KNOWLEDGE_NOT_CONFIGURED', '请先配置私有 Storage 和独立 Embedding 服务。');
      const id = randomUUID();
      const objectKey = `pdf/${id}.pdf`;
      await db.insert(documents).values({
        id, filename, objectKey, storageOrigin: storage.origin, storageBucket: storage.bucket,
        size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), status: 'uploaded',
        embeddingSpace: embedder.space, dimensions: embedder.dimensions,
      });
      try {
        await storage.put(objectKey, bytes);
        await db.update(documents).set({ storageReady: true, updatedAt: new Date() }).where(eq(documents.id, id));
      } catch (error) {
        await db.update(documents).set({ status: 'failed', errorCode: error instanceof PublicError ? error.code : 'UPLOAD_FAILED', errorMessage: '原始 PDF 保存失败，请检查私有存储配置。', updatedAt: new Date() }).where(eq(documents.id, id));
        throw error;
      }
      return get(id);
    },
    async processOne() {
      if (!storage || !embedder) return false;
      const now = new Date();
      // Cleanup must use the same service boundary as task claiming.
      const scope = and(eq(documents.storageOrigin, storage.origin), eq(documents.storageBucket, storage.bucket), eq(documents.embeddingSpace, embedder.space));
      await db.update(documents).set({ status: 'failed', errorCode: 'UPLOAD_INTERRUPTED', errorMessage: '上传中断，未确认保存成功。', updatedAt: now }).where(and(scope, eq(documents.status, 'uploaded'), eq(documents.storageReady, false), lt(documents.createdAt, new Date(Date.now() - 300000))));
      await db.update(documents).set({ status: 'failed', errorCode: 'PROCESSING_INTERRUPTED', errorMessage: '多次处理中断，停止自动恢复。', updatedAt: now }).where(and(scope, eq(documents.status, 'processing'), lt(documents.leaseUntil, now), sql`${documents.attempts} >= 2`));
      const claimed = await db.transaction(async tx => {
        const [row] = await tx.select().from(documents).where(and(
          eq(documents.storageReady, true), eq(documents.embeddingSpace, embedder.space),
          eq(documents.storageOrigin, storage.origin), eq(documents.storageBucket, storage.bucket),
          sql`${documents.attempts} < 2`,
          or(eq(documents.status, 'uploaded'), and(eq(documents.status, 'processing'), lt(documents.leaseUntil, now))),
        )).orderBy(documents.createdAt).limit(1).for('update', { skipLocked: true });
        if (!row) return null;
        const token = randomUUID();
        await tx.update(documents).set({ status: 'processing', attempts: row.attempts + 1, leaseToken: token, leaseUntil: new Date(Date.now() + 300000), updatedAt: now }).where(eq(documents.id, row.id));
        return { ...row, token };
      });
      if (!claimed) return false;
      const owns = and(eq(documents.id, claimed.id), eq(documents.leaseToken, claimed.token), eq(documents.status, 'processing'));
      const heartbeat = setInterval(() => {
        void db.update(documents).set({ leaseUntil: new Date(Date.now() + 300000) }).where(owns).catch(() => {});
      }, 30000);
      try {
        const bytes = await storage.get(claimed.objectKey);
        if (createHash('sha256').update(bytes).digest('hex') !== claimed.sha256) throw new PublicError(422, 'PDF_HASH_MISMATCH', '存储文件内容不匹配。');
        const pages = await parsePdf(bytes);
        const chunks = chunkPages(pages);
        const vectors: number[][] = [];
        for (let i = 0; i < chunks.length; i += 16) vectors.push(...await embedder.embed(chunks.slice(i, i + 16).map(c => c.text)));
        await db.transaction(async tx => {
          const [row] = await tx.select({ id: documents.id }).from(documents).where(owns).for('update');
          if (!row) return;
          for (let i = 0; i < chunks.length; i += 50) {
            await tx.insert(documentChunks).values(chunks.slice(i, i + 50).map((chunk, offset) => ({ ...chunk, documentId: claimed.id, embedding: vectors[i + offset], dimensions: embedder.dimensions, embeddingSpace: embedder.space })));
          }
          await tx.update(documents).set({ status: 'ready', pageCount: pages.length, chunkCount: chunks.length, errorCode: null, errorMessage: null, leaseUntil: null, updatedAt: new Date() }).where(owns);
        });
      } catch (error) {
        if (shutdownSignal?.aborted) return false;
        await db.update(documents).set({ status: 'failed', errorCode: error instanceof PublicError ? error.code : 'PDF_PROCESSING_FAILED', errorMessage: error instanceof PublicError ? error.message : 'PDF 处理失败，未发布知识片段。', leaseUntil: null, updatedAt: new Date() }).where(owns);
      } finally { clearInterval(heartbeat); }
      return true;
    },
  };
}
export function startDocumentWorker(service: { processOne(): Promise<boolean> }) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let running: Promise<void> = Promise.resolve();
  const tick = async () => {
    try { if (!stopped) await service.processOne(); } catch { /* A transient DB error is retried on the next tick; document leases remain durable. */ }
    if (!stopped) timer = setTimeout(() => { running = tick(); }, 2000);
  };
  running = tick();
  return async () => { stopped = true; clearTimeout(timer); await running; };
}
