// Intentionally NO deletion implementation. Requires a separate human-approved cleanup later.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configuredDatabase, runDirectory, tables, type CorpusRun } from '../tests/support/corpus-db.js';
const runId = process.argv[2];
if (!/^[a-f0-9-]{36}$/.test(runId ?? '') || process.env.CORPUS_SHARED_DB_AUTHORIZED !== '1') throw new Error('CORPUS_DRY_RUN_AUTH_REQUIRED');
const run: CorpusRun = JSON.parse(await readFile(resolve(runDirectory({ runId }), 'manifest.json'), 'utf8'));
const database = configuredDatabase();
const client = await database.pool.connect();
try {
  await client.query('begin read only');
  const targets = [...Object.values(run.inventory).flatMap(rows => rows.map(row => row.id)), ...run.objects.map(o => o.key)];
  const foreignReferences: { table: string; id: string }[] = [];
  const missing: { table: string; id: string }[] = [];
  for (const table of tables) {
    const ids = run.inventory[table].map(r => r.id);
    const current = new Set((await client.query(`select id from ${table} where id=any($1::uuid[])`, [ids])).rows.map(r => r.id));
    for (const id of ids) if (!current.has(id)) missing.push({ table, id });
    // Exact scalar UUID/object-key matches across FK and nested JSON; never fuzzy names.
    const rows = (await client.query(`select id from ${table} t where not (id=any($1::uuid[])) and jsonb_path_exists(to_jsonb(t), '$.** ? (@ == $targets[*])', jsonb_build_object('targets',$2::jsonb))`, [ids, JSON.stringify(targets)])).rows;
    foreignReferences.push(...rows.map(r => ({ table, id: r.id })));
  }
  await client.query('commit');
  const deletionOrder = ['email_deliveries', 'email_draft_confirmations', 'email_drafts', 'risk_evidence', 'meeting_todos', 'meeting_risks', 'memory_jobs', 'memories', 'presentation_jobs', 'messages', 'meeting_analyses', 'meetings', 'document_chunks', 'documents', 'conversations'];
  const plan = { runId, generatedAt: new Date().toISOString(), mode: 'READ_ONLY_DRY_RUN', authorizedToDelete: false, executedDeletes: 0,
    stageBComplete: false, status: foreignReferences.length || missing.length ? 'BLOCKED_REVIEW_REFERENCES_OR_MISSING_ROWS' : 'WAITING_STAGE_B_AND_SEPARATE_DELETE_APPROVAL',
    proposedDatabaseObjects: deletionOrder.map(table => ({ table, objects: run.inventory[table as keyof typeof run.inventory] })),
    storage: run.objects, cloudStorageDeletionCandidates: [], foreignReferences, missing,
    limitations: ['Exact structured UUID/object-key references only; incidental free text and future records require human review and a fresh dry run.', 'No cloud Storage was used by Stage A.', 'Do not delete this run while Stage B or other readers rely on it.'] };
  await writeFile(resolve(runDirectory(run), 'cleanup-dry-run.json'), JSON.stringify(plan, null, 2) + '\n');
  console.log(JSON.stringify({ runId, mode: plan.mode, status: plan.status, objects: Object.values(run.inventory).reduce((n, rows) => n + rows.length, 0), foreignReferences: foreignReferences.length, missing: missing.length, executedDeletes: 0 }));
} finally { client.release(); await database.pool.end(); }
