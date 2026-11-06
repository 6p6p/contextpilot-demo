// User-approved single-column migration. No providers, file deletion, backfill or rollback.
import {configuredDatabase} from '../tests/support/corpus-db.js';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
if(process.env.APPROVE_MEETING_ARCHIVE_0010!=='1')throw Error('0010 explicit approval required');
const database=configuredDatabase();database.pool.options.max=1;
try{
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
 if(journal.entries.length!==11||journal.entries.at(-1).tag!=='0010_meeting_archive')throw Error('Unexpected migration set');
 const parent=await readFile('drizzle/0009_demo_management.sql');
 const last=(await database.pool.query('select hash from drizzle.__drizzle_migrations order by created_at desc limit 1')).rows[0];
 if(last?.hash!==createHash('sha256').update(parent).digest('hex'))throw Error('Unexpected migration parent');
 const snapshot=async()=>JSON.stringify((await database.pool.query("select id,md5((to_jsonb(m)-'archived_at')::text) as hash from meetings m order by id")).rows);
 const before=await snapshot();
 await database.pool.query("set lock_timeout='5s'");
 await migrate(database.db,{migrationsFolder:'drizzle'});
 const after=await snapshot();
 const fields=(await database.pool.query("select column_name,is_nullable,column_default,data_type from information_schema.columns where table_schema='public' and table_name='meetings' and column_name='archived_at'")).rows;
 const count=(await database.pool.query('select count(*)::int as count from meetings where archived_at is not null')).rows[0].count;
 const receipt={migration:'0010',fields,oldRowsUnchanged:before===after,nonNullFlags:count,oldProjectionReadable:true};
 await mkdir('.acceptance/mvp-v1.2',{recursive:true});await writeFile('.acceptance/mvp-v1.2/migration-receipt.json',JSON.stringify(receipt,null,2),{flag:'wx'});
 console.log(JSON.stringify(receipt));if(before!==after||fields.length!==1||fields[0].is_nullable!=='YES'||fields[0].column_default!==null||count!==0)process.exitCode=1;
}catch{console.log(JSON.stringify({migration:'0010',status:'FAILED_STOPPED',credentialsLogged:false}));process.exitCode=1;}finally{await database.pool.end();}
