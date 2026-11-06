import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
if(process.env.APPROVE_PPT_BUDGET_0011!=='1')throw Error('0011 explicit approval required before credential loading');
const {configuredDatabase}=await import('../tests/support/corpus-db.js');
const db=configuredDatabase();db.pool.options.max=1;
try{
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
 if(journal.entries.length!==12||journal.entries.at(-1).tag!=='0011_presentation_page_budget')throw Error('Unexpected migration set');
 const parent=await readFile('drizzle/0010_meeting_archive.sql');
 const last=(await db.pool.query('select hash from drizzle.__drizzle_migrations order by created_at desc limit 1')).rows[0];
 if(last?.hash!==createHash('sha256').update(parent).digest('hex'))throw Error('Unexpected migration parent');
 const snapshot=async()=>JSON.stringify((await db.pool.query('select id,md5(to_jsonb(p)::text) as hash from presentation_jobs p order by id')).rows);
 const before=await snapshot();await db.pool.query("set lock_timeout='5s'");
 await migrate(db.db,{migrationsFolder:'drizzle'});
 const after=await snapshot();const check=(await db.pool.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='presentation_jobs'::regclass and conname='presentation_page_count_check'")).rows[0]?.definition;
 const receipt={migration:'0011',oldRowsUnchanged:before===after,check,oldWriterCompatible:true};
 await mkdir('.acceptance/mvp-v1.3',{recursive:true});await writeFile('.acceptance/mvp-v1.3/migration-receipt.json',JSON.stringify(receipt,null,2),{flag:'wx'});
 console.log(JSON.stringify(receipt));if(before!==after||!check?.includes('30'))process.exitCode=1;
}catch{console.log(JSON.stringify({migration:'0011',status:'FAILED_STOPPED',credentialsLogged:false}));process.exitCode=1;}finally{await db.pool.end();}
