import { isPresentationIntent } from '../presentations/intent.js';
import type { PresentationService } from '../presentations/service.js';
import type { PresentationAuth } from '../presentations/auth.js';
import type { SearchProvider } from '../search/service.js';
import type { MemoryService } from '../memory/service.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createConversationSchema, sendMessageSchema } from '../../../../shared/chat.js';
import { createChatService } from './service.js';
import { PublicError } from '../errors.js';
import type { createDatabase } from '../db/client.js';
import type { ChatModel } from '../llm/adapter.js';
import type { KnowledgeAnswerer } from '../knowledge/retrieval.js';

export function registerChatRoutes(app: FastifyInstance, database: ReturnType<typeof createDatabase>, model: ChatModel | null, knowledge?: KnowledgeAnswerer | null, memory?: MemoryService | null, search?: SearchProvider | null, presentations?: PresentationService | null, presentationAuth?: PresentationAuth) {
  const service = database ? createChatService(database, model, knowledge, memory, search, presentations) : null;
  function requireService() {
    if (!service) throw new PublicError(503, 'DATABASE_NOT_CONFIGURED', '尚未配置数据库。');
    return service;
  }
  const id = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;
  app.get('/api/conversations', async () => ({ conversations: await requireService().list() }));
  app.post('/api/conversations', async (request, reply) => {
    const input = createConversationSchema.parse(request.body);
    return reply.code(201).send({ conversation: await requireService().create(input.title) });
  });
  app.get('/api/conversations/:id/messages', async request => ({ messages: await requireService().history(id(request.params)) }));
  app.post('/api/conversations/:id/messages', async request => {
    const input = sendMessageSchema.parse(request.body);
    if(isPresentationIntent(input.content)){if(!presentationAuth)throw new PublicError(503,'PPT_ACCESS_NOT_CONFIGURED','PPT 访问尚未配置。');presentationAuth.require(request);}
    return { messages: await requireService().send(id(request.params), input) };
  });
}
