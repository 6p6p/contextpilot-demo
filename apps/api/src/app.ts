import { createPresentationAuth } from './presentations/auth.js';
import {registerDemoAccess} from './demo/access.js';
import {createDemoTransport} from './demo/limits.js';
import { createPresentationService } from './presentations/service.js';
import { createPresentationSources } from './presentations/sources.js';
import { registerPresentationRoutes } from './presentations/routes.js';
import { createSearchProvider } from './search/service.js';
import type { EmailProvider } from './email/provider.js';
import { registerEmailRoutes } from './email/routes.js';
import { createResendProvider } from './email/provider.js';
import { createMemoryService } from './memory/service.js';
import { startDocumentWorker } from './knowledge/service.js';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import type { Env } from './config/env.js';
import { createDatabase, probeDatabase } from './db/client.js';
import { registerChatRoutes } from './chat/routes.js';
import { createChatModel } from './llm/adapter.js';
import { PublicError } from './errors.js';
import { createStorage } from './knowledge/storage.js';
import { createEmbedder } from './knowledge/embedding.js';
import { registerDocumentRoutes } from './knowledge/routes.js';
import { createRetriever, createKnowledgeAnswerer } from './knowledge/retrieval.js';
import { registerMeetingRoutes } from './meetings/routes.js';

// In-process dependency injection for isolated tests; no HTTP/env mock-provider switch.
export function buildApp(env: Env, overrides: { emailProvider?: EmailProvider | null } = {}) {
  const app = Fastify({
    pluginTimeout: 30000,
    logger: env.NODE_ENV === 'test' ? false : {
      level: env.LOG_LEVEL,
      serializers:{req:(request)=>({method:request.method,url:request.url?.split('?')[0]})},
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    bodyLimit: 1024 * 1024,
  });
  app.addHook('onRequest',async(request,reply)=>{reply.header('x-request-id',request.id);});
  registerDemoAccess(app,env);
  const database = createDatabase(env);
  database?.pool.on('error', () => app.log.error('Idle database connection failed'));
  app.addHook('onClose', async () => { await database?.pool.end(); });
  const shutdown = new AbortController();
  app.addHook('preClose', async () => { shutdown.abort(); });
  const cancellableFetch=createDemoTransport(env,(input,options)=>fetch(input,{...options,signal:AbortSignal.any([shutdown.signal,...(options?.signal?[options.signal]:[])])}));
  const storage = createStorage(env, cancellableFetch);
  const embedder = createEmbedder(env, cancellableFetch);
  const memory = database ? createMemoryService(database, createChatModel({ ...env, LLM_MAX_TOKENS: 4096 }, cancellableFetch, { jsonMode: true }), embedder, env.MEMORY_SCOPE, shutdown.signal) : null;
  app.get('/api/memories', async () => { if (!memory) throw new PublicError(503, 'DATABASE_NOT_CONFIGURED', '数据库未配置。'); return memory.list(); });
  if (memory) {
    let stop: (() => Promise<void>) | undefined;
    app.addHook('onReady', async () => { stop = startDocumentWorker(memory); });
    app.addHook('preClose', async () => { await stop?.(); });
  }
  registerEmailRoutes(app, database, overrides.emailProvider === undefined ? createResendProvider(env) : overrides.emailProvider, env, shutdown.signal);
  registerDocumentRoutes(app, database, storage, embedder, shutdown.signal);
  registerMeetingRoutes(app, database, storage, createChatModel({ ...env, LLM_MAX_TOKENS: env.MEETING_MAX_TOKENS, LLM_TIMEOUT_MS: env.MEETING_TIMEOUT_MS }, cancellableFetch, { jsonMode: true }), shutdown.signal, memory?.scope);
  const search=createSearchProvider(env,cancellableFetch);
  const retrieve=database&&embedder?createRetriever(database,embedder,env.RAG_MIN_SIMILARITY):null;
  const pptAuth=createPresentationAuth(env);
  const presentations=database?createPresentationService(database,storage,createChatModel({...env,LLM_TIMEOUT_MS:60000},cancellableFetch),createPresentationSources(database,retrieve,memory,search),env,shutdown.signal):null;
  registerPresentationRoutes(app,presentations,pptAuth,Boolean(env.PPT_ACCESS_KEY||env.DEMO_ACCESS_KEY));
  registerChatRoutes(app, database, createChatModel(env,cancellableFetch), retrieve ? createKnowledgeAnswerer(retrieve) : null, memory, search, presentations,pptAuth);

  app.get('/api/health', async () => ({
    status: 'ok', service: 'contextpilot-api',
    database: database ? 'not_checked' : 'not_configured',
  }));
  app.get('/api/ready', async (_request, reply) => {
    const status = await probeDatabase(database);
    return reply.code(status === 'connected' ? 200 : 503).send({
      status: status === 'connected' ? 'ready' : 'not_ready', database: status,
    });
  });
  app.setErrorHandler((error, request, reply) => {
    const invalid = error instanceof ZodError || (error instanceof Error && 'validation' in error);
    const statusCode = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    const status = error instanceof PublicError ? error.statusCode : invalid ? 400 : statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    if (status === 500) request.log.error({ requestId: request.id }, 'Unhandled request failure');
    return reply.code(status).send({ error: {
      code: error instanceof PublicError ? error.code : status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      message: error instanceof PublicError ? error.message : status === 500 ? 'Internal server error' : 'Invalid request',
    }, requestId: request.id });
  });
  if (env.NODE_ENV === 'production') {
    app.register(fastifyStatic, { root: resolve('dist/web'), wildcard: false });
  }
  app.setNotFoundHandler((request, reply) => {
    if (env.NODE_ENV === 'production' && request.method === 'GET' && !request.url.startsWith('/api') && request.headers.accept?.includes('text/html')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' }, requestId: request.id });
  });
  return app;
}
