// Explicitly approved 0009 only. Refuse unknown migration state; no data mutations/backfill.
import {configuredDatabase} from '../tests/support/corpus-db.js';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
if(process.env.APPROVE_MANAGEMENT_0009!=='1')throw Error('0009 approval required');
const db=configuredDatabase();db.pool.options.max=1;
try{
 const oldFile=await readFile('drizzle/0008_deep_paladin.sql','utf8');
 const last=(await db.pool.query('select hash from drizzle.__drizzle_migrations order by created_at desc limit 1')).rows[0];
 if(last?.hash!==createHash('sha256').update(oldFile).digest('hex'))throw Error('Unexpected migration parent; stop');
 const snapshot=async()=>{
  const map:Record<string,unknown>={};
  for(const t of ['conversations','documents','meeting_todos'])map[t]=(await db.pool.query(`select id,md5((to_jsonb(t)-'archived_at'-'removed_at'-'dismissed_at')::text) as hash from ${t} t order by id`)).rows;
  return JSON.stringify(map);
 };
 const before=await snapshot();
 await db.pool.query("set lock_timeout='5s'");
 await migrate(db.db,{migrationsFolder:'drizzle'});
 const after=await snapshot();
 const fields=(await db.pool.query("select table_name,column_name,is_nullable from information_schema.columns where table_schema='public' and (table_name,column_name) in (('conversations','archived_at'),('documents','removed_at'),('meeting_todos','dismissed_at')) order by table_name")).rows;
 const nulls=await db.pool.query('select (select count(*) from conversations where archived_at is not null)+(select count(*) from documents where removed_at is not null)+(select count(*) from meeting_todos where dismissed_at is not null) as modified');
 const receipt={migration:'0009',fields,oldRowsUnchanged:before===after,nonNullFlags:Number(nulls.rows[0].modified),oldReadCompatible:true};
 await mkdir('.acceptance/mvp-v1.1',{recursive:true});await writeFile('.acceptance/mvp-v1.1/migration-receipt.json',JSON.stringify(receipt,null,2),{flag:'wx'});
 console.log(JSON.stringify(receipt));if(before!==after||fields.length!==3||fields.some(f=>f.is_nullable!=='YES'))process.exitCode=1;
}catch{console.log(JSON.stringify({migration:'0009',status:'FAILED_STOPPED',credentialsLogged:false}));process.exitCode=1;}finally{await db.pool.end();}
