import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Env } from '../config/env.js';

export function createDatabase(env: Env) {
  if (!env.DATABASE_URL) return null;
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
  });
  return { pool, db: drizzle(pool) };
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
