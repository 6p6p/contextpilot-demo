import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createStorage } from '../apps/api/src/knowledge/storage.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseEnv } from '../apps/api/src/config/env.js';
import { createDatabase } from '../apps/api/src/db/client.js';

const path = process.env.ACCEPTANCE_PHASE === '5' ? '.acceptance/phase5-regression.json' : process.env.ACCEPTANCE_PHASE === '4' ? '.acceptance/phase4-regression.json' : '.acceptance/phase3-live.json';
const schema = z.object({ runId: z.uuid(), baselineDocuments: z.array(z.uuid()), baselineConversations: z.array(z.uuid()), documents: z.array(z.uuid()), conversations: z.array(z.uuid()), cleaned: z.boolean() });
async function load() { return schema.parse(JSON.parse(await readFile(path, 'utf8'))); }
export async function acceptanceFilename(name: string) {
  return process.env.ACCEPTANCE_TRACKING === '1' ? `acceptance-${(await load()).runId}-${name}` : name;
}
export async function recordAcceptance(kind: 'documents' | 'conversations', id: string) {
  if (process.env.ACCEPTANCE_TRACKING !== '1') return;
  z.uuid().parse(id);
  const manifest = await load();
  const baseline = kind === 'documents' ? manifest.baselineDocuments : manifest.baselineConversations;
  if (manifest.cleaned || baseline.includes(id)) throw new Error('Refusing to track a baseline record');
  if (!manifest[kind].includes(id)) manifest[kind].push(id);
  await writeFile(path, JSON.stringify(manifest, null, 2));
}
async function main() {
  await import('dotenv/config');
  const env = parseEnv(process.env);
  const database = createDatabase(env);
  if (!database) throw new Error('Database not configured');
  try {
    const command = process.argv[2];
    if (command === 'init') {
      await mkdir('.acceptance', { recursive: true });
      const docs = await database.pool.query('select id from documents');
      const conversations = await database.pool.query('select id from conversations');
      await writeFile(path, JSON.stringify({ runId: randomUUID(), baselineDocuments: docs.rows.map(r => r.id), baselineConversations: conversations.rows.map(r => r.id), documents: [], conversations: [], cleaned: false }, null, 2), { flag: 'wx' });
      console.log('Acceptance baseline captured; no original data changed.');
      return;
    }
    const manifest = await load();
    if (manifest.documents.some(id => manifest.baselineDocuments.includes(id)) || manifest.conversations.some(id => manifest.baselineConversations.includes(id))) throw new Error('Unsafe manifest overlaps baseline');
    if (command === 'audit') {
      const rows = await database.pool.query('select d.status,c.dimensions,vector_dims(c.embedding) as actual_dimensions,count(c.id)::int as chunks from documents d left join document_chunks c on c.document_id=d.id where d.id=any($1::uuid[]) group by d.status,c.dimensions,vector_dims(c.embedding)', [manifest.documents]);
      const snapshots = await database.pool.query("select count(*)::int as count, bool_and(s->>'filename'=d.filename and (s->>'page')::int=c.page and strpos(c.text,s->>'quote')>0) as verified from messages m cross join lateral jsonb_array_elements(m.sources) s join document_chunks c on c.id=(s->>'sourceId')::uuid join documents d on d.id=c.document_id where m.conversation_id=any($1::uuid[])", [manifest.conversations]);
      const storage = createStorage(env);
      const files = await database.pool.query('select object_key,sha256 from documents where id=any($1::uuid[]) and storage_ready=true', [manifest.documents]);
      let storageHashesVerified = 0;
      if (storage) for (const row of files.rows) {
        const bytes = await storage.get(row.object_key);
        if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new Error('Persisted object hash mismatch');
        storageHashesVerified++;
      }
      console.log(JSON.stringify({ trackedDocuments: manifest.documents.length, trackedConversations: manifest.conversations.length, vectorAudit: rows.rows, persistedCitationAudit: snapshots.rows[0], storageHashesVerified }));
      return;
    }
    if (command !== 'cleanup' || manifest.cleaned) throw new Error('Unknown command or already cleaned');
    // User explicitly authorized cleanup of this run's temporary records only.
    // Never select deletions by filename, timestamp range, table-wide filter or bucket prefix.
    const client = await database.pool.connect();
    let deletedDocuments = 0;
    let deletedStorageObjects = 0;
    let deletedChunks = 0;
    let deletedMessages = 0;
    try {
      await client.query('begin');
      for (const id of manifest.conversations) {
        await client.query('select id from conversations where id=$1 for update', [id]);
        deletedMessages += (await client.query('delete from messages where conversation_id=$1', [id])).rowCount ?? 0;
        await client.query('delete from conversations where id=$1', [id]);
      }
      for (const id of manifest.documents) {
        const references = await client.query("select 1 from messages m where exists(select 1 from jsonb_array_elements(m.sources) s where s->>'documentId'=$1) limit 1", [id]);
        if (references.rowCount) throw new Error('Tracked document is referenced outside test conversations; retained');
        const result = await client.query('select object_key,storage_origin,storage_bucket from documents where id=$1 for update', [id]);
        if (!result.rowCount) continue;
        const row = result.rows[0];
        if (row.object_key !== `pdf/${id}.pdf`) throw new Error('Object identity mismatch; cleanup stopped');
        const syntheticOnly = row.storage_origin === 'https://integration.invalid' && row.storage_bucket === 'stub-private';
        if (!syntheticOnly && (row.storage_origin !== env.SUPABASE_URL?.replace(/\/+$/, '') || row.storage_bucket !== env.SUPABASE_STORAGE_BUCKET)) throw new Error('Storage identity mismatch; cleanup stopped');
        if (!syntheticOnly) {
          const response = await fetch(`${row.storage_origin}/storage/v1/object/${encodeURIComponent(row.storage_bucket)}`, {
          method: 'DELETE', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { apikey: env.SUPABASE_STORAGE_KEY!, authorization: `Bearer ${env.SUPABASE_STORAGE_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ prefixes: [row.object_key] }),
        });
          await response.body?.cancel();
          if (!response.ok) throw new Error('Test object cleanup failed; stopped');
          deletedStorageObjects++;
        }
        deletedChunks += (await client.query('delete from document_chunks where document_id=$1', [id])).rowCount ?? 0;
        await client.query('delete from documents where id=$1', [id]);
        deletedDocuments++;
      }
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
    const originals = await database.pool.query('select (select count(*)::int from documents where id=any($1::uuid[])) as documents,(select count(*)::int from conversations where id=any($2::uuid[])) as conversations', [manifest.baselineDocuments, manifest.baselineConversations]);
    const originalIdsIntact = originals.rows[0].documents === manifest.baselineDocuments.length && originals.rows[0].conversations === manifest.baselineConversations.length;
    manifest.cleaned = true;
    await writeFile(path, JSON.stringify(manifest, null, 2));
    const report = { cleanup: 'completed', deletedDocuments, deletedStorageObjects, deletedChunks, deletedMessages, deletedConversations: manifest.conversations.length, baselineIdsIntact: originalIdsIntact };
    await writeFile('.acceptance/cleanup-report.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    if (!originalIdsIntact) process.exitCode = 1;
  } finally { await database.pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Acceptance operation failed safely; no credentials logged. Check manifest before continuing.'); process.exitCode = 1; });
}
