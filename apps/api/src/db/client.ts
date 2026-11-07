import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Env } from '../config/env.js';
import { readFileSync } from 'node:fs';
import * as schema from './schema.js';
import { ConfigurationError } from '../config/startup-diagnostic.js';

function readDatabaseCa(path: string) {
  try { return readFileSync(path, 'utf8'); }
  catch { throw new ConfigurationError('Configured database CA file cannot be read', ['DATABASE_CA_CERT']); }
}

export function databaseOptions(env: Env) {
  if (!env.DATABASE_URL) return null;
  const url = new URL(env.DATABASE_URL);
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 5432),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    statement_timeout: 15000,
    ssl: env.DATABASE_SSL ? {
      rejectUnauthorized: true,
      ...(env.DATABASE_CA_CERT ? { ca: readDatabaseCa(env.DATABASE_CA_CERT) } : {}),
    } : undefined,
  };
}

export function createDatabase(env: Env) {
  if (!env.DATABASE_URL) return null;
  const pool = new pg.Pool(databaseOptions(env)!);
  return { pool, db: drizzle(pool, { schema }) };
}
export async function probeDatabase(database: ReturnType<typeof createDatabase>) {
  if (!database) return 'not_configured' as const;
  try {
    await database.pool.query('select 1');
    return 'connected' as const;
  } catch {
    return 'unavailable' as const;
  }
}
