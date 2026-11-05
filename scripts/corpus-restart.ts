// Isolated process restoration probe. Only SELECT and local STUB object reads; no workers.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configuredDatabase, runDirectory, localStorage, digest, type CorpusRun } from '../tests/support/corpus-db.js';
import { createPresentationService } from '../apps/api/src/presentations/service.js';
const runId = process.argv[2];
if (!/^[a-f0-9-]{36}$/.test(runId ?? '') || process.env.CORPUS_SHARED_DB_AUTHORIZED !== '1') throw new Error('CORPUS_RESTART_AUTH_REQUIRED');
globalThis.fetch = async () => { throw new Error('CORPUS_RESTART_NO_NETWORK'); };
let database: ReturnType<typeof configuredDatabase> | undefined;
try {
  const run: CorpusRun = JSON.parse(await readFile(resolve(runDirectory({ runId }), 'manifest.json'), 'utf8'));
  database = configuredDatabase();
  const local = localStorage(run), storage = { ...local, async put() { throw new Error('CORPUS_RESTART_READ_ONLY_STORAGE'); } };
  const ppt = createPresentationService(database, storage, { async complete() { throw new Error('CORPUS_RESTART_NO_MODEL'); } }, async () => { throw new Error('CORPUS_RESTART_NO_COLLECT'); }, { PPT_SCOPE: run.scope, PPT_MAX_TOKENS: 8192 });
  for (const table of ['conversations', 'documents', 'meetings', 'memories', 'messages'] as const) {
    const ids = run.inventory[table].map(r => r.id);
    const { rows } = await database.pool.query(`select count(*)::int as n from ${table} where id=any($1::uuid[])`, [ids]);
    if (rows[0].n !== ids.length) throw new Error('CORPUS_RESTART_MISSING_ROW');
  }
  let pptDownloads = 0;
  for (const job of run.inventory.presentation_jobs) {
    const file = await ppt.download(job.id);
    const { rows } = await database.pool.query('select sha256,status from presentation_jobs where id=$1 and scope=$2', [job.id, run.scope]);
    if (rows[0]?.status !== 'ready' || rows[0].sha256 !== digest(file.bytes)) throw new Error('CORPUS_RESTART_HASH_MISMATCH');
    pptDownloads++;
  }
  console.log(JSON.stringify({ runId, restored: true, pptDownloads, externalCalls: 0 }));
} catch { console.log(JSON.stringify({ runId, restored: false, code: 'CORPUS_RESTART_FAILED' })); process.exitCode = 1; }
finally { await database?.pool.end(); }
