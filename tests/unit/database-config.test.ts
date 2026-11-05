import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { databaseOptions } from '../../apps/api/src/db/client.js';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {X509Certificate} from 'node:crypto';

describe('database configuration with synthetic credentials only', () => {
  it('decodes password exactly once and enforces certificate verification', () => {
    const password = 'example@#%:/? password';
    const env = parseEnv({ DATABASE_URL: `postgresql://postgres.project:${encodeURIComponent(password)}@example.pooler.supabase.com:5432/postgres` });
    expect(databaseOptions(env)).toMatchObject({ user: 'postgres.project', password, port: 5432, ssl: { rejectUnauthorized: true } });
  });
  it('rejects insecure remote database or query overrides', () => {
    expect(() => parseEnv({ DATABASE_URL: 'postgresql://user:example@db.example/postgres', DATABASE_SSL: 'false' })).toThrow('requires DATABASE_SSL=true');
    expect(() => parseEnv({ DATABASE_URL: 'postgresql://user:example@db.example/postgres?sslmode=disable' })).toThrow('must not contain query');
    for(const parameter of ['sslmode=require','sslrootcert=ignored.crt','sslcert=ignored.crt','sslkey=ignored.key'])expect(()=>parseEnv({DATABASE_URL:`postgresql://user:example@db.example/postgres?${parameter}`})).toThrow('must not contain query');
  });
  it('loads reviewed public Supabase CA while retaining strict TLS and default hostname verification',()=>{
    const path=resolve('prod-ca-2021.crt');const pem=readFileSync(path,'utf8'),cert=new X509Certificate(pem);
    expect(pem).not.toContain('PRIVATE KEY');expect(cert.ca).toBe(true);expect(cert.verify(cert.publicKey)).toBe(true);
    expect(cert.fingerprint256).toBe('80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
    const options=databaseOptions(parseEnv({DATABASE_URL:'postgresql://user:example@db.example/postgres',DATABASE_SSL:'true',DATABASE_CA_CERT:path}));
    expect(options?.ssl).toEqual({rejectUnauthorized:true,ca:pem});expect(options?.host).toBe('db.example');
    // No custom checkServerIdentity/servername override: pg uses the actual host and Node TLS checks it.
    expect(options?.ssl&&'checkServerIdentity' in options.ssl).toBe(false);
  });
  it('fails closed when a configured CA file is absent',()=>{
    expect(()=>databaseOptions(parseEnv({DATABASE_URL:'postgresql://user:example@db.example/postgres',DATABASE_CA_CERT:'nonexistent-ca-file.crt'}))).toThrow();
  });
  it('supports explicit local non-TLS development', () => {
    expect(databaseOptions(parseEnv({ DATABASE_URL: 'postgresql://user:example@127.0.0.1/demo', DATABASE_SSL: 'false' }))?.ssl).toBeUndefined();
  });
  it('rejects credentials embedded in LLM URL and insecure remote HTTP', () => {
    expect(() => parseEnv({ LLM_BASE_URL: 'http://model.example/v1' })).toThrow('Invalid LLM_BASE_URL');
    expect(() => parseEnv({ LLM_BASE_URL: 'https://user:example@model.example/v1' })).toThrow('Invalid LLM_BASE_URL');
  });
});
