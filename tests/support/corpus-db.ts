import 'dotenv/config';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { createDatabase } from '../../apps/api/src/db/client.js';
import type { PrivateStorage } from '../../apps/api/src/knowledge/storage.js';

export const tables = ['conversations', 'messages', 'documents', 'document_chunks', 'meetings', 'meeting_analyses', 'meeting_risks', 'risk_evidence', 'meeting_todos', 'email_drafts', 'email_draft_confirmations', 'memory_jobs', 'memories', 'presentation_jobs', 'email_deliveries'] as const;
export type Table = typeof tables[number];
export type Inventory = Record<Table, { id: string; links: Record<string, unknown> }[]>;
export const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export function configuredDatabase() {
  if (process.env.EMAIL_DELIVERY_ENABLED === 'true') throw new Error('CORPUS_EMAIL_DELIVERY_MUST_STAY_OFF');
  // Only database fields enter the test runtime configuration. Never instantiate providers from root .env.
  const env = parseEnv({ NODE_ENV: 'test', DATABASE_URL: process.env.DATABASE_URL, DATABASE_SSL: process.env.DATABASE_SSL, DATABASE_CA_CERT: process.env.DATABASE_CA_CERT, EMAIL_DELIVERY_ENABLED: 'false' });
  const database = createDatabase(env);
  if (!database) throw new Error('CORPUS_DATABASE_NOT_CONFIGURED');
  return database;
}
export function newRun() {
  const runId = randomUUID();
  return { runId, createdAt: new Date().toISOString(), scope: `corpus_${runId}`, origin: `https://${runId}.corpus.invalid`, bucket: 'corpus-local-stub',
    roots: { conversations: [randomUUID(), randomUUID(), randomUUID()], documents: [randomUUID(), randomUUID(), randomUUID()], meetings: [randomUUID(), randomUUID()] },
    objects: [] as { key: string; sha256: string; size: number; backend: 'LOCAL_STUB'; cloudObject: false }[],
    inventory: Object.fromEntries(tables.map(t => [t, []])) as unknown as Inventory,
    results: Object.fromEntries(Array.from({ length: 8 }, (_, n) => [`T0${n + 1}`, { result: 'NOT_RUN', dependency: 'real PostgreSQL; all external providers STUB', reason: 'not executed' }])),
    baseline: {} as Record<string, Record<string, string>>, baselineChanges: [] as { table: string; id: string; change: string }[],
    cleanup: { approved: false, executed: false, status: 'RETAIN_UNTIL_STAGE_B_AND_SEPARATE_APPROVAL' },
    externalCalls: { deepseek: 0, embedding: 0, tavily: 0, resend: 0, supabaseStorage: 0 },
    retainForManual: ['tests/corpus/v1/meeting.txt', 'tests/corpus/v1/project-brief.pdf', 'tests/fixtures/rag-project.pdf', 'tests/fixtures/rag-owner.pdf'],
  };
}
export type CorpusRun = ReturnType<typeof newRun>;
export const runDirectory = (run: { runId: string }) => resolve('.acceptance/corpus-stage-a', run.runId);
export async function saveRun(run: CorpusRun) {
  await mkdir(runDirectory(run), { recursive: true });
  const temporary = resolve(runDirectory(run), `manifest-${randomUUID()}.tmp`);
  const counts = Object.fromEntries(tables.map(table => [table, run.inventory[table].length]));
  await writeFile(temporary, JSON.stringify({ ...run, counts, totalDatabaseRecords: Object.values(counts).reduce((sum, n) => sum + n, 0), storageObjectCount: run.objects.length }, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, resolve(runDirectory(run), 'manifest.json'));
}
export function localStorage(run: CorpusRun): PrivateStorage {
  const file = (key: string) => {
    if (!/^[a-zA-Z0-9_/-]+\.(?:pdf|txt|pptx)$/.test(key) || key.includes('..')) throw new Error('CORPUS_INVALID_LOCAL_KEY');
    return resolve(runDirectory(run), 'objects', key);
  };
  const find = async (key: string) => { try { return await readFile(file(key)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } };
  return { origin: run.origin, bucket: run.bucket, find, async get(key) { const bytes = await find(key); if (!bytes) throw new Error('CORPUS_LOCAL_OBJECT_MISSING'); return bytes; },
    async put(key, bytes) {
      const path = file(key); await mkdir(resolve(path, '..'), { recursive: true });
      // Journal the object before creating it. Never overwrite a previous artifact.
      const hash = digest(bytes), intent = run.objects.find(o => o.key === key);
      if (intent && (intent.sha256 !== hash || intent.size !== bytes.length)) throw new Error('CORPUS_LOCAL_OBJECT_CONFLICT');
      if (!intent) { run.objects.push({ key, sha256: hash, size: bytes.length, backend: 'LOCAL_STUB', cloudObject: false }); await saveRun(run); }
      const existing = await find(key);
      if (existing) { if (digest(existing) !== hash) throw new Error('CORPUS_LOCAL_OBJECT_CONFLICT'); return; }
      await writeFile(path, bytes, { flag: 'wx' });
    } };
}
type DB = ReturnType<typeof configuredDatabase>;
export async function snapshot(database: DB) {
  const result: CorpusRun['baseline'] = {};
  // Only server-computed hashes/IDs leave PostgreSQL, never historical private text.
  for (const table of tables) {
    const rows = (await database.pool.query(`select id, md5(to_jsonb(t)::text) as hash from ${table} t limit 10001`)).rows;
    if (rows.length > 10000) throw new Error('CORPUS_BASELINE_TOO_LARGE');
    result[table] = Object.fromEntries(rows.map(r => [r.id, r.hash]));
  }
  return result;
}
export async function inventory(database: DB, run: CorpusRun) {
  const queries: Record<Table, [string, unknown[]]> = {
    conversations: ['select id from conversations where id=any($1::uuid[])', [run.roots.conversations]],
    messages: ['select id,conversation_id from messages where conversation_id=any($1::uuid[])', [run.roots.conversations]],
    documents: ['select id,object_key,storage_origin,storage_bucket from documents where id=any($1::uuid[])', [run.roots.documents]],
    document_chunks: ['select id,document_id from document_chunks where document_id=any($1::uuid[])', [run.roots.documents]],
    meetings: ['select id,object_key,storage_origin,storage_bucket,current_analysis_id from meetings where id=any($1::uuid[])', [run.roots.meetings]],
    meeting_analyses: ['select id,meeting_id,version from meeting_analyses where meeting_id=any($1::uuid[])', [run.roots.meetings]],
    meeting_risks: ['select id,meeting_id,analysis_id from meeting_risks where meeting_id=any($1::uuid[])', [run.roots.meetings]],
    risk_evidence: ['select e.id,e.risk_id from risk_evidence e join meeting_risks r on r.id=e.risk_id where r.meeting_id=any($1::uuid[])', [run.roots.meetings]],
    meeting_todos: ['select id,meeting_id,analysis_id from meeting_todos where meeting_id=any($1::uuid[])', [run.roots.meetings]],
    email_drafts: ['select id,meeting_id,analysis_id,risk_ids,todo_ids from email_drafts where meeting_id=any($1::uuid[])', [run.roots.meetings]],
    email_draft_confirmations: ['select c.id,c.draft_id from email_draft_confirmations c join email_drafts d on d.id=c.draft_id where d.meeting_id=any($1::uuid[])', [run.roots.meetings]],
    memory_jobs: ['select id,message_id,analysis_id,scope from memory_jobs where scope=$1', [run.scope]],
    memories: ['select id,source_group,sources,scope from memories where scope=$1', [run.scope]],
    presentation_jobs: ['select id,conversation_id,assistant_message_id,object_key,scope,context from presentation_jobs where scope=$1', [run.scope]],
    email_deliveries: ['select e.id,e.draft_id,e.confirmation_id from email_deliveries e join email_drafts d on d.id=e.draft_id where d.meeting_id=any($1::uuid[])', [run.roots.meetings]],
  };
  for (const table of tables) {
    const [query, args] = queries[table];
    run.inventory[table] = (await database.pool.query(query, args)).rows.map(({ id, ...links }) => ({ id, links }));
    if (run.inventory[table].some(row => run.baseline[table]?.[row.id])) throw new Error('CORPUS_BASELINE_OVERLAP');
  }
  await saveRun(run);
}
