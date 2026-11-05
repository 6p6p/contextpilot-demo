// Reconcile an interrupted local journal using exact roots/scope. SELECT only in PostgreSQL.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configuredDatabase, inventory, runDirectory, type CorpusRun } from '../tests/support/corpus-db.js';
const runId = process.argv[2];
if (!/^[a-f0-9-]{36}$/.test(runId ?? '') || process.env.CORPUS_SHARED_DB_AUTHORIZED !== '1') throw new Error('CORPUS_AUDIT_AUTH_REQUIRED');
const run: CorpusRun = JSON.parse(await readFile(resolve(runDirectory({ runId }), 'manifest.json'), 'utf8'));
const database = configuredDatabase();
try {
  await inventory(database, run);
  console.log(JSON.stringify({ runId, created: Object.fromEntries(Object.entries(run.inventory).map(([table, rows]) => [table, rows.length])), total: Object.values(run.inventory).reduce((n, rows) => n + rows.length, 0), externalCalls: 0 }));
} finally { await database.pool.end(); }
