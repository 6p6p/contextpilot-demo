import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export function expectedMigrations(){
 const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8')) as {entries:{tag:string;when:number}[]};
 return journal.entries.map(e=>({hash:createHash('sha256').update(readFileSync(`drizzle/${e.tag}.sql`,'utf8')).digest('hex'),when:e.when}));
}
export async function migrationStatus(query:(sql:string)=>Promise<{rows:{hash:string;created_at:string|number}[]}>){
 const expected=expectedMigrations();
 const actual=await query('select hash,created_at from drizzle.__drizzle_migrations order by id');
 return {expected:expected.length,applied:actual.rows.length,matched:actual.rows.length===expected.length&&expected.every(e=>actual.rows.some(r=>r.hash===e.hash&&Number(r.created_at)===e.when))};
}
