import 'dotenv/config';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { parseEnv } from '../config/env.js';
import { createDatabase } from './client.js';

const database = createDatabase(parseEnv(process.env));
if (!database) {
  console.error('Database not configured: set DATABASE_URL before running migrations.');
  process.exitCode = 1;
} else {
  try {
    await migrate(database.db, { migrationsFolder: resolve('drizzle') });
    console.log('Database migrations applied.');
  } catch {
    console.error('Migration failed; verify database access and extension permissions. No credentials are logged.');
    process.exitCode = 1;
  } finally {
    await database.pool.end();
  }
}
