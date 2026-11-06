import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
it('0011 only widens the page budget CHECK, never modifies existing rows or drops tables',async()=>{
 const sql=await readFile('drizzle/0011_presentation_page_budget.sql','utf8');
 expect(sql.match(/ALTER TABLE/g)).toHaveLength(2);expect(sql).toContain('between 3 and 30');expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|UPDATE |DELETE FROM|DROP COLUMN/i);
 const before=JSON.parse(await readFile('drizzle/meta/0010_snapshot.json','utf8')),after=JSON.parse(await readFile('drizzle/meta/0011_snapshot.json','utf8'));
 expect(after.prevId).toBe(before.id);expect(after.tables['public.presentation_jobs'].checkConstraints.presentation_page_count_check.value).toContain('3 and 30');
 after.id=before.id;after.prevId=before.prevId;after.tables['public.presentation_jobs'].checkConstraints=before.tables['public.presentation_jobs'].checkConstraints;expect(after).toEqual(before);
});
