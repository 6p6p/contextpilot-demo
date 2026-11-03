import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createDocumentService, startDocumentWorker } from './service.js';
import type { Database } from './service.js';
import type { PrivateStorage } from './storage.js';
import type { Embedder } from './embedding.js';
import { PublicError } from '../errors.js';
import { MAX_PDF_BYTES } from './pdf.js';

export function registerDocumentRoutes(app: FastifyInstance, database: Database | null, storage: PrivateStorage | null, embedder: Embedder | null, shutdownSignal?: AbortSignal) {
  const service = database ? createDocumentService(database, storage, embedder, shutdownSignal) : null;
  const requireService = () => { if (!service) throw new PublicError(503, 'DATABASE_NOT_CONFIGURED', '尚未配置数据库。'); return service; };
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer', bodyLimit: MAX_PDF_BYTES }, (_request, body, done) => done(null, body));
  const id = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;
  app.get('/api/documents', async () => ({ documents: await requireService().list() }));
  app.get('/api/documents/:id', async request => ({ document: await requireService().get(id(request.params)) }));
  app.get('/api/documents/:id/download', async (request, reply) => {
    const file = await requireService().download(id(request.params));
    return reply.header('cache-control', 'private, no-store').header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`).type('application/pdf').send(file.bytes);
  });
  app.post('/api/documents', { bodyLimit: MAX_PDF_BYTES }, async (request, reply) => {
    const { filename } = z.object({ filename: z.string().trim().min(1).max(200).refine(v => !/[\x00-\x1f/\\]/.test(v)) }).parse(request.query);
    if (!Buffer.isBuffer(request.body)) throw new PublicError(415, 'PDF_TYPE_REQUIRED', '请求体必须为 PDF 文件。');
    const document = await requireService().upload(filename, String(request.headers['content-type'] || ''), request.body);
    return reply.code(202).send({ document });
  });
  if (service && storage && embedder) {
    let stop: (() => Promise<void>) | undefined;
    app.addHook('onReady', async () => { stop = startDocumentWorker(service); });
    app.addHook('preClose', async () => { await stop?.(); });
  }
}
