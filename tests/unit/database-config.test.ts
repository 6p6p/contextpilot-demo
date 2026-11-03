import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { databaseOptions } from '../../apps/api/src/db/client.js';

describe('database configuration with synthetic credentials only', () => {
  it('decodes password exactly once and enforces certificate verification', () => {
    const password = 'example@#%:/? password';
    const env = parseEnv({ DATABASE_URL: `postgresql://postgres.project:${encodeURIComponent(password)}@example.pooler.supabase.com:5432/postgres` });
    expect(databaseOptions(env)).toMatchObject({ user: 'postgres.project', password, port: 5432, ssl: { rejectUnauthorized: true } });
  });
  it('rejects insecure remote database or query overrides', () => {
    expect(() => parseEnv({ DATABASE_URL: 'postgresql://user:example@db.example/postgres', DATABASE_SSL: 'false' })).toThrow('requires DATABASE_SSL=true');
    expect(() => parseEnv({ DATABASE_URL: 'postgresql://user:example@db.example/postgres?sslmode=disable' })).toThrow('must not contain query');
  });
  it('supports explicit local non-TLS development', () => {
    expect(databaseOptions(parseEnv({ DATABASE_URL: 'postgresql://user:example@127.0.0.1/demo', DATABASE_SSL: 'false' }))?.ssl).toBeUndefined();
  });
  it('rejects credentials embedded in LLM URL and insecure remote HTTP', () => {
    expect(() => parseEnv({ LLM_BASE_URL: 'http://model.example/v1' })).toThrow('Invalid LLM_BASE_URL');
    expect(() => parseEnv({ LLM_BASE_URL: 'https://user:example@model.example/v1' })).toThrow('Invalid LLM_BASE_URL');
  });
});
