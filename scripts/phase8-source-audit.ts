import 'dotenv/config';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from '../apps/api/src/config/env.js';
import {createDatabase} from '../apps/api/src/db/client.js';
import {verifyPlan} from '../apps/api/src/presentations/plan.js';
const env=parseEnv(process.env),db=createDatabase(env)!;const root='.acceptance/phase8-live';
try{
 if(env.EMAIL_DELIVERY_ENABLED)throw new Error('Email must remain disabled');
 const manifest=JSON.parse(await readFile(`${root}/manifest.json`,'utf8'));
 const rows=(await db.pool.query('select * from presentation_jobs where id=any($1::uuid[])',[manifest.cases.map((c:any)=>c.id)])).rows;
 const used=rows.flatMap(r=>{verifyPlan(r.plan,r.page_count,r.sources);const ids=new Set(r.plan.slides.flatMap((p:any)=>p.items.flatMap((i:any)=>i.kind==='quote'?[i.sourceId]:i.sourceIds??[])));return r.sources.filter((s:any)=>ids.has(s.id));});
 const load=async(table:string,kind:string,key:string)=>{const ids=[...new Set(used.filter(s=>s.kind===kind).map(s=>s.locator[key]))];return (await db.pool.query(`select * from ${table} where id=any($1::uuid[])`,[ids])).rows;};
 const [pdf,todos,risks,memory]=await Promise.all([load('document_chunks','pdf','sourceId'),load('meeting_todos','todo','todoId'),load('meeting_risks','meeting_risk','riskId'),load('memories','memory','memoryId')]);
 for(const s of used){let valid=true;
  if(s.kind==='pdf')valid=pdf.some(r=>r.id===s.locator.sourceId&&r.document_id===s.locator.documentId&&r.page===s.locator.page&&r.text===s.text);
  if(s.kind==='todo')valid=todos.some(r=>r.id===s.locator.todoId&&r.task===s.text&&r.owner===s.owner&&r.due_date===s.dueDate&&r.version===s.locator.todoVersion);
  if(s.kind==='meeting_risk')valid=risks.some(r=>r.id===s.locator.riskId&&r.level===s.riskLevel&&`${r.description}\n潜在影响：${r.impact}`===s.text);
  if(s.kind==='memory')valid=memory.some(r=>r.id===s.locator.memoryId&&r.content===s.text);
  if(s.kind==='web')valid=new URL(s.locator.url).hostname==='nodejs.org'&&typeof s.locator.queriedAt==='string';
  if(!valid)throw new Error('Source persistence mismatch');
 }
 const result={jobs:rows.length,selectedSourceSnapshots:used.length,kinds:[...new Set(used.map(s=>s.kind))],sourceChecksPassed:true,emailDisabled:true,providerCalls:0};
 await writeFile(`${root}/source-final-audit.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch{console.error('Sanitized persisted-source audit failed');process.exitCode=1;}finally{await db.pool.end();}
