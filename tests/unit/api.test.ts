import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { healthSchema } from '../../shared/health.js';

describe('real Fastify routes', () => {
  const apps: ReturnType<typeof buildApp>[] = [];
  function app() {
    const instance = buildApp(parseEnv({ NODE_ENV: 'test' }));
    apps.push(instance);
    return instance;
  }
  afterEach(async () => { await Promise.all(apps.splice(0).map(instance => instance.close())); });
  it('returns liveness but not database success', async () => {
    const response = await app().inject('/api/health');
    expect(response.statusCode).toBe(200);
    expect(healthSchema.parse(response.json()).database).toBe('not_configured');
  });
  it('returns 503 readiness when database is missing', async () => {
    const response = await app().inject('/api/ready');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', database: 'not_configured' });
  });
  it('returns a structured 404', async () => {
    const response = await app().inject('/api/does-not-exist');
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' }, requestId: expect.any(String) });
  });
  it('truthfully rejects chat without a database', async () => {
    const instance = app();
    const response = await instance.inject('/api/conversations');
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('DATABASE_NOT_CONFIGURED');
  });
  it('rejects invalid chat input before any external call', async () => {
    const response = await app().inject({ method: 'POST', url: '/api/conversations', payload: { title: '' } });
    expect(response.statusCode).toBe(400);
  });
  it('reports missing database for PDF routes without calling Storage', async () => {
    const instance = app();
    expect((await instance.inject('/api/documents')).statusCode).toBe(503);
    const response = await instance.inject({ method: 'POST', url: '/api/documents?filename=test.pdf', headers: { 'content-type': 'application/pdf' }, payload: Buffer.from('%PDF-1.7 synthetic') });
    expect(response.statusCode).toBe(503);
  });
  it('rejects non-PDF content type and oversized uploads before external calls', async () => {
    const instance = app();
    const wrong = await instance.inject({ method: 'POST', url: '/api/documents?filename=test.pdf', headers: { 'content-type': 'image/png' }, payload: Buffer.from('not PDF') });
    expect(wrong.statusCode).toBe(415);
    const large = await instance.inject({ method: 'POST', url: '/api/documents?filename=test.pdf', headers: { 'content-type': 'application/pdf' }, payload: Buffer.alloc(6 * 1024 * 1024 + 1) });
    expect(large.statusCode).toBe(413);
  });
  it('does not expose internal exception text', async () => {
    const instance = app();
    instance.get('/test-error', () => { throw new Error('private implementation detail'); });
    const response = await instance.inject('/test-error');
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('private implementation detail');
  });
  it('normalizes invalid request bodies', async () => {
    const instance = app();
    instance.post('/test-body', async request => request.body);
    const response = await instance.inject({ method: 'POST', url: '/test-body', headers: { 'content-type': 'application/json' }, payload: '{' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_REQUEST');
  });
});
