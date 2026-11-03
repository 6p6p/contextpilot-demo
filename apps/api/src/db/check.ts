import 'dotenv/config';
import { parseEnv } from '../config/env.js';
import { createDatabase, probeDatabase } from './client.js';

const database = createDatabase(parseEnv(process.env));
try {
  const status = await probeDatabase(database);
  console.log(`Database: ${status}`);
  if (status !== 'connected') process.exitCode = 1;
} finally {
  await database?.pool.end();
}
