import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../knowledge/service.js';
import { startDocumentWorker } from '../knowledge/service.js';
import type { EmailProvider } from './provider.js';
import { createEmailService, type EmailConfig } from './service.js';
import { sendEmailSchema } from '../../../../shared/email.js';
import { PublicError } from '../errors.js';
export function registerEmailRoutes(app: FastifyInstance, database: Database | null, provider: EmailProvider | null, config: EmailConfig, signal: AbortSignal) {
  const service = database ? createEmailService(database, provider, config, signal) : null;
  const requireService = () => { if (!service) throw new PublicError(503, 'DATABASE_NOT_CONFIGURED', '数据库未配置。'); return service; };
  const id = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;
  app.get('/api/email/config', async () => ({ enabled: config.EMAIL_DELIVERY_ENABLED, configured: Boolean(provider && config.EMAIL_FROM && config.EMAIL_ALLOWED_RECIPIENTS.length), sender: config.EMAIL_FROM ?? null, mode: config.EMAIL_MODE, allowedRecipients: config.EMAIL_ALLOWED_RECIPIENTS }));
  app.post('/api/email/preflight', async () => requireService().preflight());
  app.get('/api/email-drafts/:id/deliveries', async request => ({ deliveries: await requireService().list(id(request.params)) }));
  app.post('/api/email-drafts/:id/send', async (request, reply) => {
    const input = sendEmailSchema.parse(request.body);
    return reply.code(202).send({ delivery: await requireService().enqueue(id(request.params), input.version, request.id) });
  });
  app.post('/api/email-deliveries/:id/refresh', async request => ({ delivery: await requireService().refresh(id(request.params)) }));
  if (service && config.EMAIL_DELIVERY_ENABLED && provider) {
    let stop: (() => Promise<void>) | undefined;
    app.addHook('onReady', async () => { stop = startDocumentWorker(service); });
    app.addHook('preClose', async () => { await stop?.(); });
  }
}
