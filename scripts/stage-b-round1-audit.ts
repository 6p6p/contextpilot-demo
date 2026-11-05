// Operator-authorized read-only audit. No workers or providers; no database writes.
import { configuredDatabase } from '../tests/support/corpus-db.js';
import { mkdir, writeFile } from 'node:fs/promises';
const db = configuredDatabase();
try {
  const c = (await db.pool.query("select distinct conversation_id from messages where role='user' and strpos(content,$1)>0", ['cee51f13-79e6-42d6-9caa-dc21b81cf079'])).rows.map(r => r.conversation_id);
  const messages = (await db.pool.query('select id,conversation_id,role,status,error_code,knowledge_mode,search_mode from messages where conversation_id=any($1::uuid[]) order by created_at', [c])).rows;
  const ids = messages.map(r => r.id);
  const jobs = (await db.pool.query('select id,message_id,status,error_code from memory_jobs where message_id=any($1::uuid[])', [ids])).rows;
  const memories = (await db.pool.query("select id,kind,sources from memories where exists(select 1 from jsonb_array_elements(sources) s where s->>'sourceId'=any($1::text[]))", [ids])).rows;
  await mkdir('.acceptance/stage-b-round1', { recursive: true });
  await writeFile('.acceptance/stage-b-round1/readonly.json', JSON.stringify({ messages, jobs, memories }, null, 2));
  console.log(JSON.stringify({ conversations: c.length, messages: messages.length, errors: messages.filter(r => r.error_code).map(r => ({ code: r.error_code, pdf: r.knowledge_mode, search: r.search_mode })), jobs: jobs.map(r => r.status), memoryFacts: memories.length }));
} catch (e) { console.log(JSON.stringify({ readOnly: 'FAILED', code: (e as { code?: string }).code ?? 'CONNECTION_OR_QUERY_FAILED' })); process.exitCode = 1; }
finally { await db.pool.end(); }
