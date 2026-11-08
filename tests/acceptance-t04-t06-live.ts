// Explicit real-service acceptance. No email/search/document/meeting workers.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import dotenv from 'dotenv';
import Fastify from 'fastify';
import {parseEnv} from '../apps/api/src/config/env.js';
import {createDatabase} from '../apps/api/src/db/client.js';
import {createStorage} from '../apps/api/src/knowledge/storage.js';
import {createEmbedder} from '../apps/api/src/knowledge/embedding.js';
import {createChatModel} from '../apps/api/src/llm/adapter.js';
import {createMemoryService} from '../apps/api/src/memory/service.js';
import {memoryJobs} from '../apps/api/src/db/schema.js';
import {registerChatRoutes} from '../apps/api/src/chat/routes.js';
import {registerDemoAccess} from '../apps/api/src/demo/access.js';
import {createPresentationAuth} from '../apps/api/src/presentations/auth.js';
import {registerPresentationRoutes} from '../apps/api/src/presentations/routes.js';
import {createPresentationService} from '../apps/api/src/presentations/service.js';
import {createPresentationSources} from '../apps/api/src/presentations/sources.js';
import {selectedDocuments} from '../apps/api/src/presentations/documents.js';
import {validatePptx} from '../apps/api/src/presentations/render.js';
import JSZip from 'jszip';

assert.equal(process.env.RUN_FINAL_LIVE,'1','Requires explicit shared-DB/live-services authorization');
const raw=dotenv.parse(readFileSync('.env'));
const fields=['DATABASE_URL','DATABASE_SSL','DATABASE_CA_CERT','SUPABASE_URL','SUPABASE_STORAGE_KEY','SUPABASE_STORAGE_BUCKET','LLM_BASE_URL','LLM_MODEL','LLM_API_KEY','EMBEDDING_BASE_URL','EMBEDDING_MODEL','EMBEDDING_API_KEY','EMBEDDING_DIMENSIONS'];
const resume=process.env.FINAL_LIVE_RESUME;
const caseFilter=process.env.FINAL_LIVE_CASE;
if(resume)assert.match(resume,/^final-[a-f0-9]{8}$/);
const run=resume??('final-'+randomUUID().slice(0,8)),directory=resolve('.acceptance/t04-t06-final',run);mkdirSync(directory,{recursive:true});
const key=randomBytes(24).toString('hex');
const env=parseEnv({...Object.fromEntries(fields.map(k=>[k,raw[k]])),NODE_ENV:'test',HOST:'127.0.0.1',DEMO_ACCESS_KEY:key,MEMORY_SCOPE:run+'-memory',PPT_SCOPE:run+'-ppt',PPT_MAX_PAGES:'30',PPT_MAX_TOKENS:'8192',DEMO_WRITES_PER_MINUTE:'100'});
const before=JSON.parse(readFileSync('.acceptance/t04-t06-final/before.json','utf8'));
const selected=before.ppt[0]; assert.ok(selected);
const context={meetingId:selected.context.meetingId,documentIds:selected.context.documentIds,useMemory:false,useChat:false,webQuery:null};
const previous=resume?JSON.parse(readFileSync(`${directory}/report.json`,'utf8')):null;
if(previous){assert.ok(previous.status==='FAIL'||caseFilter&&previous.status==='PASS');writeFileSync(`${directory}/prior-${Date.now()}.json`,JSON.stringify(previous,null,2));}
const report:any={run,status:'RUNNING',calls:previous?.calls??[],memory:[],ppt:caseFilter?previous.ppt.filter((p:any)=>p.name!==caseFilter):[],checks:[],reservedMaxRmb:previous?.reservedMaxRmb??0};
let phase='preflight';
const save=()=>writeFileSync(`${directory}/report.json`,JSON.stringify(report,null,2));
const transport:typeof fetch=async(input,init)=>{
 const url=new URL(String(input));
 if(url.pathname.endsWith('/chat/completions')){
  const body=JSON.parse(String(init?.body));assert.equal(url.hostname,'api.deepseek.com');assert.equal(body.model,'deepseek-flash');assert.ok(report.calls.filter((c:any)=>c.kind==='llm').length<20);
  assert.equal(body.thinking?.type,'disabled');assert.ok(body.max_tokens<=8192);
  const reservation=((Buffer.byteLength(JSON.stringify(body.messages))+1024)*0.3+body.max_tokens*1.2)*10/1e6;
  assert.ok(report.reservedMaxRmb+reservation<=6,'Live budget cap reached');report.reservedMaxRmb+=reservation;
  const row:any={kind:'llm',phase,maxTokens:body.max_tokens};report.calls.push(row);save();
  const start=Date.now(),response=await fetch(input,init);row.httpStatus=response.status;
  if(response.ok){const data=await response.clone().json();Object.assign(row,{promptTokens:data.usage?.prompt_tokens,completionTokens:data.usage?.completion_tokens,finishReason:data.choices?.[0]?.finish_reason,elapsedMs:Date.now()-start});}save();return response;
 }
 if(url.pathname.endsWith('/embeddings')){assert.equal(url.hostname,'api.siliconflow.cn');assert.ok(report.calls.filter((c:any)=>c.kind==='embedding').length<8);report.calls.push({kind:'embedding',phase});save();return fetch(input,init);}
 assert.equal(url.origin,new URL(env.SUPABASE_URL!).origin,'Only approved Storage calls allowed');
 assert.ok(url.pathname.startsWith('/storage/v1/'));
 if(init?.method==='POST')assert.ok(url.pathname.includes('/presentations/'),'Only new PPT objects may be uploaded');
 return fetch(input,init);
};
const db=createDatabase(env)!;assert.ok(db);
const app=Fastify({logger:false});
const snapshot=async()=>{
 const hashes:any={};
 for(const [table,ids] of [['documents',before.documents.map((r:any)=>r.id)],['meetings',before.meetings.map((r:any)=>r.id)],['memories',before.memories.map((r:any)=>r.id)],['presentation_jobs',before.ppt.map((r:any)=>r.id)]] as [string,string[]][]){hashes[table]=(await db.pool.query(`select id,md5(to_jsonb(t)::text) as hash from ${table} t where id=any($1::uuid[]) order by id`,[ids])).rows;}
 return hashes;
};
try{
 const unchanged=await snapshot();report.initialHashes=unchanged;
 const queues:any={};for(const table of ['documents','meetings','memory_jobs','presentation_jobs'])queues[table]=(await db.pool.query(`select status,count(*)::int as count from ${table} group by status`)).rows;
 report.queuesBefore=queues;save();
 const storage=createStorage(env,transport)!;const embedder=createEmbedder(env,transport)!;const model=createChatModel(env,transport)!;assert.ok(storage&&embedder&&model);
 const memory=createMemoryService(db,model,embedder,env.MEMORY_SCOPE);
 const collect=createPresentationSources(db,null,memory,null,ids=>selectedDocuments(db,ids,{origin:storage.origin,bucket:storage.bucket}));
 const ppt=createPresentationService(db,storage,model,collect,env);
 const auth=createPresentationAuth(env);registerDemoAccess(app,env);
 registerChatRoutes(app,db,model,null,memory,null,ppt,auth);
 registerPresentationRoutes(app,ppt,auth,false); // manual, isolated worker pumping only
 app.setErrorHandler((error,_,reply)=>{const e=error as any;reply.code(e.statusCode??500).send({error:{code:e.code??'ACCEPTANCE_ERROR'}});});
 await app.listen({host:'127.0.0.1',port:0});const base=`http://127.0.0.1:${(app.server.address() as any).port}`;
 let cookie='';
 const api=async(path:string,body?:unknown)=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const json:any=await response.json();assert.ok(response.ok,`${path}: ${json.error?.code??response.status}`);return json;};
 const login=await fetch(base+'/api/demo-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accessKey:key})});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];
 const conversation=async(label:string)=>(await api('/api/conversations',{title:run+' '+label})).conversation.id;
 const send=async(id:string,content:string,extra:any={})=>{const r=await api(`/api/conversations/${id}/messages`,{content,clientRequestId:randomUUID(),searchMode:'off',...extra});const answer=r.messages.find((m:any)=>m.role==='assistant');assert.equal(answer.status,'completed',answer.errorCode);return answer;};
 phase='memory-introduction';
 const introduction=before.messages.find((m:any)=>m.content.includes('总负责人'))?.content;assert.ok(introduction);
 if(!resume){await send(await conversation('事实输入'),introduction);assert.equal(await memory.processOne(),true);}
 let list=await memory.list();assert.equal(list.jobs[0].status,'ready');assert.ok(list.memories.length>0);
 phase='meeting-memory-job';
 const meeting=before.meetings.find((m:any)=>m.id===context.meetingId);assert.ok(meeting?.current_analysis_id);
 if(!resume){await db.db.insert(memoryJobs).values({scope:env.MEMORY_SCOPE,analysisId:meeting.current_analysis_id});assert.equal(await memory.processOne(),true);}
 list=await memory.list();assert.ok(list.jobs.every(j=>j.status==='ready'));report.memoryJobs=list.jobs;save();
 const questions=[
  'ORCHID-7421总负责人是谁？林岚何时在哪里协调试点准备？请引用已保存记忆，不要混入ORCHID-FIN。',
  '根据已保存会议记忆，ORCHID-7421保留的试点目标是什么？11月27日是否获批？',
  '根据已保存记忆，ORCHID-FIN的林岚何时在哪里负责什么？不要混入ORCHID-7421。',
 ];
 if(previous?.memory?.length===3&&previous?.missingAnswer){report.memory=previous.memory;report.missingAnswer=previous.missingAnswer;}
 else {
 for(const [i,q] of questions.entries()){
  phase='memory-query-'+i;const recalled=await memory.retrieve(q);const id=await conversation('跨会话召回'+i),answer=await send(id,q);report.memory.push({question:q,recalled,answer});save();
  assert.ok(answer.memorySources.length>0);
  assert.ok(answer.memorySources.every((m:any)=>recalled.some(r=>r.id===m.id)));
  assert.equal(answer.sources.length,0);assert.equal(answer.webSources.length,0);
  for(const value of i===0?['Dr. Mira Qiao','林岚','2026-11-06','南京']:i===1?['2026-11-20','2026-11-27','未获批']:['苏州','2026-12-01','财务'])assert.ok(answer.content.includes(value),'Incomplete memory answer: '+value);
  assert.ok(!answer.content.includes(i===2?'南京':'苏州'));
  const refreshed=await api(`/api/conversations/${id}/messages`);assert.equal(refreshed.messages.at(-1).content,answer.content);
 }
 phase='memory-restart';const fresh=createDatabase(env)!;try{const restarted=createMemoryService(fresh,model,embedder,env.MEMORY_SCOPE);assert.ok((await restarted.retrieve(questions[0])).some(m=>m.sources.some(s=>s.evidence.quote.includes('南京'))));}finally{await fresh.pool.end();}
 const missing=await send(await conversation('只用记忆拒答'),'仅根据已保存会议记忆，保险合同的保单编号是什么？',{knowledgeMode:true,searchMode:'required'});assert.ok(missing.content.includes('无法确认'));assert.equal(missing.sources.length,0);report.missingAnswer=missing;save();
 }
 const cases=[
  {name:'auto-combined-1',prompt:'请根据我选择的PDF和会议，生成一份中文项目管理汇报PPT，面向管理层。包括项目概况、关键事实、交付风险、会议待办、重要时间节点和后续行动建议。保留AMBER-593、Dr. Mira Qiao、2026-11-20试点目标、2026-11-27未批准改期提议，以及人工编辑后的林岚/2026-11-09待办。区分事实、分析和建议，不得编造业务进展。请根据内容自动决定合适的页数，不要为了凑页数重复内容。',ctx:context},
  {name:'auto-combined-2',prompt:'根据所选PDF和会议生成中文管理汇报PPT，包含关键事实、风险、最新人工待办、未批准提议和行动建议。按内容自动决定页数，区分事实、分析、建议，不编造进展。',ctx:context},
  {name:'fixed-5-simple',prompt:'生成5页中文团队沟通方法培训PPT，直接面向员工，给具体方法与练习建议。',ctx:{}},
  {name:'auto-simple',prompt:'生成中文团队沟通方法培训PPT，直接给员工可实施的方法和练习，页数按内容决定。',ctx:{}},
  {name:'auto-pdf',prompt:'根据所选PDF生成中文项目概况PPT，关键事实和资料边界必须准确，页数按内容决定。',ctx:{documentIds:context.documentIds}},
  {name:'fixed-10-combined',prompt:'根据所选PDF和会议生成10页中文管理汇报PPT，包含项目事实、风险、未批准改期提议、人工编辑后的待办及行动建议，区分事实与建议。',ctx:context},
  {name:'fixed-5-combined',prompt:'根据所选PDF和会议生成5页中文管理汇报PPT，保留项目、负责人、访问码、试点目标、未批准改期提议、人工待办与建议。',ctx:context},
 ];
 if(caseFilter)assert.ok(cases.some(c=>c.name===caseFilter));
 for(const item of cases.filter(c=>!caseFilter||c.name===caseFilter)){
  phase=item.name;
  const prior=previous?.ppt?.find((p:any)=>p.name===item.name);
  let id:string;
  if(prior?.presentation.status==='failed'){
   assert.equal(prior.presentation.retries,0,'Cannot exceed the one explicit replan');id=prior.id;
   await api(`/api/presentations/${id}/retry`,{replan:true});
  }else{
   const message=await send(await conversation(item.name),item.prompt,{presentationContext:item.ctx});
   id=message.content.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/)![0];
  }
  assert.equal(await ppt.processOne(),true);
  let detail=await api(`/api/presentations/${id}`);
  if(detail.presentation.status==='failed'&&detail.presentation.retries===0&&/^PPT_(?:INVALID|REPEATED|CONTRADICTORY|REQUIRED|SOURCE|INCOMPLETE|META|CONTENT)/.test(detail.presentation.errorCode??'')){
   report.checks.push({explicitReplan:id,reason:detail.presentation.errorCode});save();
   await api(`/api/presentations/${id}/retry`,{replan:true});await ppt.processOne();detail=await api(`/api/presentations/${id}`);
  }
  report.ppt.push({name:item.name,id,...detail});save();assert.equal(detail.presentation.status,'ready',detail.presentation.errorCode);
  const denied=await fetch(`${base}/api/presentations/${id}/download`);assert.equal(denied.status,401);
  const download=await fetch(`${base}/api/presentations/${id}/download`,{headers:{cookie}});assert.equal(download.status,200);const bytes=Buffer.from(await download.arrayBuffer());
  const shape=await validatePptx(bytes,detail.presentation.pageCount);const file=`${directory}/${item.name}${prior?.presentation.status==='ready'?'-recheck-'+id.slice(0,8):''}.pptx`;writeFileSync(file,bytes);
  const zip=await JSZip.loadAsync(bytes);const slides=[];for(let i=1;i<=shape.slideCount;i++){const xml=await zip.file(`ppt/slides/slide${i}.xml`)!.async('string');slides.push([...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m=>m[1]).join('\n'));}
  const body=slides.slice(1,-1).join('\n');
  if(item.ctx===context)for(const fact of ['AMBER-593','Dr. Mira Qiao','2026-11-20','2026-11-27','尚未获批','林岚','2026-11-09','进行中'])assert.ok(body.includes(fact),'Missing visible fact: '+fact);
  if(item.name.startsWith('fixed-'))assert.equal(shape.slideCount,item.name.includes('-10')?10:5);
  const again=await fetch(`${base}/api/presentations/${id}/download`,{headers:{cookie}});assert.equal(createHash('sha256').update(Buffer.from(await again.arrayBuffer())).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
  Object.assign(report.ppt.at(-1),{file,shape,slides,downloadSha:createHash('sha256').update(bytes).digest('hex'),downloadAuthChecked:true,refreshDownload:true});save();console.log(JSON.stringify({case:item.name,status:'PASS',pages:shape.slideCount}));
 }
 assert.deepEqual(await snapshot(),unchanged,'Existing demo data changed during isolated acceptance');
 report.status='PASS';report.checks.push('source demo rows unchanged','only isolated scope workers pumped','no email or search worker registered');
}catch(error){report.status='FAIL';report.failurePhase=phase;report.failureCode=(error as any)?.code??'ACCEPTANCE_FAILED';process.exitCode=1;}
finally{await app.close().catch(()=>{});await db.pool.end();save();console.log(JSON.stringify({run,directory,status:report.status,phase:report.failurePhase,error:report.failureCode,calls:report.calls.length,reservedMaxRmb:report.reservedMaxRmb}));}
