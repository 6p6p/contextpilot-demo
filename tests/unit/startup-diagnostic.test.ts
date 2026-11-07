import { expect, it } from 'vitest';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { startupDiagnostic } from '../../apps/api/src/config/startup-diagnostic.js';
import { databaseOptions } from '../../apps/api/src/db/client.js';

const production = { NODE_ENV: 'production', DEMO_ACCESS_KEY: 'synthetic-startup-password-12345678' };
it('reports exact missing email fields only on explicit production opt-in', () => {
  expect(parseEnv({ ...production, EMAIL_DELIVERY_ENABLED: 'false' }).EMAIL_DELIVERY_ENABLED).toBe(false);
  for (const configured of [{}, { RESEND_API_KEY: 'synthetic-key' }, { RESEND_API_KEY: 'synthetic-key', EMAIL_FROM: 'sender@example.invalid' }]) {
    try {
      parseEnv({ ...production, EMAIL_DELIVERY_ENABLED: 'true', ...configured });
      throw new Error('Expected configuration rejection');
    } catch (error) {
      expect(startupDiagnostic('environment', error)).toMatchObject({
        code: 'CONFIGURATION_INVALID', errorType: 'ConfigurationError',
        fields: ['RESEND_API_KEY', 'EMAIL_FROM', 'EMAIL_ALLOWED_RECIPIENTS'].filter(field => !(field in configured)),
      });
    }
  }
  expect(parseEnv({ ...production, EMAIL_DELIVERY_ENABLED: 'true', RESEND_API_KEY: 'synthetic-key', EMAIL_FROM: 'sender@example.invalid', EMAIL_ALLOWED_RECIPIENTS: 'owner@example.invalid' }).EMAIL_DELIVERY_ENABLED).toBe(true);
});

it('does not echo hostile error messages, names, codes, stacks or configuration values', () => {
  const secret = 'synthetic-private-marker';
  const error = Object.assign(new TypeError(secret), { name: secret, code: secret, cause: new Error(secret) });
  expect(startupDiagnostic('listen', error)).toEqual({ event: 'startup_failed', stage: 'listen', errorType: 'TypeError', code: 'STARTUP_EXCEPTION', fields: [] });
  expect(JSON.stringify(startupDiagnostic('listen', error))).not.toContain(secret);
  expect(startupDiagnostic('listen', Object.assign(new Error(secret), { code: 'EADDRINUSE' })).code).toBe('EADDRINUSE');
  try { parseEnv({ ...production, PORT: secret, EMAIL_FROM: secret }); }
  catch (error) {
    const result = startupDiagnostic('environment', error);
    expect(result.fields).toEqual(expect.arrayContaining(['PORT', 'EMAIL_FROM']));
    expect(JSON.stringify(result)).not.toContain(secret);
  }
});

it('identifies unreadable CA without leaking its path and still fails closed', () => {
  try {
    databaseOptions(parseEnv({ DATABASE_URL: 'postgresql://synthetic:placeholder@127.0.0.1/demo', DATABASE_CA_CERT: 'synthetic-private-marker/nonexistent.crt' }));
    throw new Error('Expected CA rejection');
  } catch (error) {
    expect(startupDiagnostic('application', error)).toMatchObject({ code: 'CONFIGURATION_INVALID', fields: ['DATABASE_CA_CERT'] });
    expect(JSON.stringify(startupDiagnostic('application', error))).not.toContain('synthetic-private-marker');
  }
});
