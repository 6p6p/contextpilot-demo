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
