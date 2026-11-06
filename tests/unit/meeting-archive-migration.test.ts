import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
it('0010 adds only the approved nullable meetings.archive timestamp; snapshot preserves all old definitions',async()=>{
 const sql=await readFile('drizzle/0010_meeting_archive.sql','utf8');
 expect(sql.replace(/^--.*$/gm,'').trim()).toBe('ALTER TABLE "meetings" ADD COLUMN "archived_at" timestamp with time zone;');
 const before=JSON.parse(await readFile('drizzle/meta/0009_snapshot.json','utf8'));
 const after=JSON.parse(await readFile('drizzle/meta/0010_snapshot.json','utf8'));
 expect(after.prevId).toBe(before.id);expect(after.tables['public.meetings'].columns.archived_at).toMatchObject({notNull:false,type:'timestamp with time zone'});
 delete after.tables['public.meetings'].columns.archived_at;after.id=before.id;after.prevId=before.prevId;expect(after).toEqual(before);
});
