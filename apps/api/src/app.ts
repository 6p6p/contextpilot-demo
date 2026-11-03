import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import type { Env } from './config/env.js';
import { createDatabase, probeDatabase } from './db/client.js';
import { registerChatRoutes } from './chat/routes.js';
import { createChatModel } from './llm/adapter.js';
import { PublicError } from './errors.js';

export function buildApp(env: Env) {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    bodyLimit: 1024 * 1024,
  });
  const database = createDatabase(env);
  database?.pool.on('error', () => app.log.error('Idle database connection failed'));
  app.addHook('onClose', async () => { await database?.pool.end(); });
  registerChatRoutes(app, database, createChatModel(env));

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
