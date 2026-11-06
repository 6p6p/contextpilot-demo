import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {setManagementFlag} from '../../apps/api/src/management.js';
it('0009 only adds three nullable timestamps; no destructive or backfill statements',async()=>{
 const sql=await readFile('drizzle/0009_demo_management.sql','utf8');
 expect(sql.match(/ALTER TABLE/g)).toHaveLength(3);expect(sql).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE|UPDATE|NOT NULL|DEFAULT)\b/i);
});
it('missing management columns fail before any mutation',async()=>{
 let connected=false;
 const db={pool:{async query(){return {rowCount:0};},async connect(){connected=true;throw Error('must not connect');}}};
 await expect(setManagementFlag(db as any,'documents','id')).rejects.toMatchObject({code:'MANAGEMENT_MIGRATION_REQUIRED'});
 expect(connected).toBe(false);
});
it('0009 snapshot changes only the three approved columns and migration identity',async()=>{
 const before=JSON.parse(await readFile('drizzle/meta/0008_snapshot.json','utf8'));
 const after=JSON.parse(await readFile('drizzle/meta/0009_snapshot.json','utf8'));
 expect(after.prevId).toBe(before.id);
 for(const [table,field] of [['conversations','archived_at'],['documents','removed_at'],['meeting_todos','dismissed_at']]){
  expect(after.tables[`public.${table}`].columns[field]).toMatchObject({notNull:false,type:'timestamp with time zone'});
  delete after.tables[`public.${table}`].columns[field];
 }
 after.id=before.id;after.prevId=before.prevId;expect(after).toEqual(before);
});
