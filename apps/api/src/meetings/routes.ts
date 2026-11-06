import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../knowledge/service.js';
import { startDocumentWorker } from '../knowledge/service.js';
import type { PrivateStorage } from '../knowledge/storage.js';
import type { ChatModel } from '../llm/adapter.js';
import { PublicError } from '../errors.js';
import { createMeetingService } from './service.js';
import { MAX_TXT_BYTES } from './analysis.js';

export function registerMeetingRoutes(app: FastifyInstance, database: Database | null, storage: PrivateStorage | null, model: ChatModel | null, signal: AbortSignal, memoryScope?: string) {
  const service = database ? createMeetingService(database, storage, model, signal, memoryScope) : null;
  const requireService = () => { if (!service) throw new PublicError(503, 'DATABASE_NOT_CONFIGURED', '数据库未配置。'); return service; };
  const id = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;
  app.removeContentTypeParser('text/plain');
  app.addContentTypeParser('text/plain', { parseAs: 'buffer', bodyLimit: MAX_TXT_BYTES }, (_request, body, done) => done(null, body));
  app.get('/api/meetings', async () => ({ meetings: await requireService().list() }));
  app.post('/api/meetings', { bodyLimit: MAX_TXT_BYTES }, async (request, reply) => {
    const { filename } = z.object({ filename: z.string().trim().min(1).max(200).refine(value => !/[\x00-\x1f/\\]/.test(value)) }).parse(request.query);
    if (!Buffer.isBuffer(request.body)) throw new PublicError(415, 'TXT_TYPE_REQUIRED', '请求体必须是 UTF-8 TXT。');
    return reply.code(202).send(await requireService().upload(filename, String(request.headers['content-type']), request.body));
  });
  app.get('/api/meetings/:id', async request => requireService().detail(id(request.params)));
  app.get('/api/meetings/:id/transcript', async request => ({ transcript: await requireService().transcript(id(request.params)) }));
  app.post('/api/meetings/:id/reanalyze', async (request, reply) => reply.code(202).send(await requireService().reanalyze(id(request.params))));
  app.patch('/api/meeting-todos/:id', async request => ({ todo: await requireService().updateTodo(id(request.params), request.body) }));
  app.patch('/api/email-drafts/:id', async request => ({ draft: await requireService().updateDraft(id(request.params), request.body) }));
  app.get('/api/email-drafts/:id/latest-preview',async request=>requireService().draftPreview(id(request.params)));
  app.post('/api/email-drafts/:id/confirm', async request => {
    const { version } = z.object({ version: z.number().int().positive() }).parse(request.body);
    return requireService().confirmDraft(id(request.params), version);
  });
  if (service && storage && model) {
    let stop: (() => Promise<void>) | undefined;
    app.addHook('onReady', async () => { stop = startDocumentWorker(service); });
    app.addHook('preClose', async () => { await stop?.(); });
  }
}
