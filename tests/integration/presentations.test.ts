import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { beforeAll,afterAll,describe,it,expect,vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../../apps/api/src/db/client.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { meetings,meetingAnalyses,meetingTodos,presentationJobs } from '../../apps/api/src/db/schema.js';
import { createPresentationService } from '../../apps/api/src/presentations/service.js';
import { createChatService } from '../../apps/api/src/chat/service.js';
import { pptPlan,pptSources } from '../support/presentation-fixtures.js';
import type { PrivateStorage } from '../../apps/api/src/knowledge/storage.js';
import { PublicError } from '../../apps/api/src/errors.js';
import {createRepairPublisher,sha256,publicationSchema} from '../../apps/api/src/presentations/publication.js';
import {renderPresentation} from '../../apps/api/src/presentations/render.js';
// REAL PostgreSQL; all models, retrieval and Storage are explicit STUBS. No real business calls.
describe('PPT durable transactions/recovery (real DB, stub external)',()=>{
 let db:NonNullable<ReturnType<typeof createDatabase>>;
 beforeAll(()=>{if(process.env.RUN_LIVE_TESTS!=='1')throw new Error('Separate DB authorization required');db=createDatabase(parseEnv(process.env))!;if(!db)throw new Error('DB required');});
 afterAll(async()=>{await db?.pool.end();});
 function setup(){
   const objects=new Map<string,Buffer>();const put=vi.fn(async(key:string,bytes:Buffer)=>{if(objects.has(key))throw new Error('No overwrite');objects.set(key,bytes);});
   const storage:PrivateStorage={origin:`https://${randomUUID()}.invalid`,bucket:'PPT-STUB',put,async get(key){return objects.get(key)!;},async find(key){return objects.get(key)??null;}};
   const model={complete:vi.fn().mockResolvedValue({content:JSON.stringify({content:pptPlan.slides.slice(1,-1).map(s=>({items:s.items}))}),model:'STUB-PPT'})};
   const sources=structuredClone(pptSources);
   const collect=vi.fn(async()=>sources);const config={PPT_SCOPE:`ppt-test-${randomUUID()}`,PPT_MAX_TOKENS:8192};
   const service=createPresentationService(db,storage,model,collect,config);const chat=createChatService(db,model,null,null,null,service);
   return {objects,put,storage,model,collect,config,service,chat,sources};
 }
 async function enqueue(s:ReturnType<typeof setup>){
   // Current source guards must verify a REAL persisted todo, not an invented UUID.
   const meetingId=randomUUID(),analysisId=randomUUID(),todoId=randomUUID();
   await db.db.insert(meetings).values({id:meetingId,filename:`STUB-PPT-TX-${meetingId}.txt`,sha256:meetingId,size:1,objectKey:meetingId,storageOrigin:s.storage.origin,storageBucket:s.storage.bucket,transcript:'合成事务测试',lineCount:1,status:'ready',currentAnalysisId:analysisId});
   await db.db.insert(meetingAnalyses).values({id:analysisId,meetingId,version:1,model:'STUB',result:{topic:null,meetingDate:null,location:null,participants:[],topics:[],decisions:[],risks:[],actions:[]}});
   await db.db.insert(meetingTodos).values({id:todoId,meetingId,analysisId,sourceKey:todoId,task:'复核供应商交付清单',owner:'周宁',dueDate:'2026-11-08',version:2,status:'open',evidence:{startLine:1,endLine:1,quote:'合成事务测试'}});
   const source=s.sources.find(q=>q.kind==='todo')!;source.locator={...source.locator,todoId,meetingId,todoVersion:2,status:'open'};
const c=await s.chat.create('PPT DB stub acceptance');const input={content:'生成5页风险汇报PPT',clientRequestId:randomUUID(),searchMode:'off' as const};const rows=await s.chat.send(c.id,input);const job=(await s.service.list())[0];return {c,input,rows,job};}
 it('atomically enqueues from chat, deduplicates and rejects source changes; normal chat creates no job',async()=>{
   const s=setup(),{c,input,rows,job}=await enqueue(s);expect(rows[1].status).toBe('completed');expect(job.assistantMessageId).toBe(rows[1].id);expect(s.model.complete).not.toHaveBeenCalled();
   await s.chat.send(c.id,input);expect(await s.service.list()).toHaveLength(1);
   await expect(s.chat.send(c.id,{...input,presentationContext:{meetingId:null,useMemory:true,webQuery:null}})).rejects.toMatchObject({code:'REQUEST_CONFLICT'});
   await s.chat.send(c.id,{content:'解释什么是PPT',clientRequestId:randomUUID(),searchMode:'off'});expect(await s.service.list()).toHaveLength(1);
 },90000);
 it('concurrent workers claim once; independent pool restores plan/file/history and verifies hash',async()=>{
   const s=setup(),{job}=await enqueue(s);const independent=createDatabase(parseEnv(process.env))!;
   try {
     const other=createPresentationService(independent,s.storage,s.model,s.collect,s.config);
     await Promise.all([s.service.processOne(),other.processOne()]);expect(s.put).toHaveBeenCalledTimes(1);expect(s.model.complete).toHaveBeenCalledTimes(1);
     expect((await other.detail(job.id)).presentation).toMatchObject({status:'ready',pageCount:5});
     expect((await other.download(job.id)).bytes.subarray(0,2).toString()).toBe('PK');
     expect((await other.detail(job.id)).sources).toEqual(s.sources);
     await s.chat.create('PPT later conversation');expect((await other.list()).some(j=>j.id===job.id)).toBe(true);
     const wrong=Buffer.from('corrupted');s.objects.set(`presentations/${job.id}.pptx`,wrong);await expect(other.download(job.id)).rejects.toMatchObject({code:'PPT_FILE_MISMATCH'});
   }finally{await independent.pool.end();}
 },90000);
 it('lost upload acknowledgement is reconciled without second file/model; explicit retry is bounded',async()=>{
   const s=setup();s.put.mockImplementationOnce(async(key,bytes)=>{s.objects.set(key,bytes);throw new PublicError(502,'STORAGE_UNAVAILABLE','STUB lost response');});
   const {job}=await enqueue(s);await s.service.processOne();expect((await s.service.detail(job.id)).presentation.status).toBe('failed');
   await expect(s.service.retry(job.id,true)).rejects.toMatchObject({code:'PPT_REPLAN_FILE_EXISTS'});
   await s.service.retry(job.id);await s.service.processOne();expect((await s.service.detail(job.id)).presentation.status).toBe('ready');expect(s.put).toHaveBeenCalledTimes(1);expect(s.model.complete).toHaveBeenCalledTimes(1);expect(s.objects.size).toBe(1);
   await expect(s.service.retry(job.id)).rejects.toMatchObject({code:'PPT_RETRY_NOT_ALLOWED'});
 },90000);
 it('expired render lease resumes saved plan without a model call and foreign scope cannot claim',async()=>{
   const s=setup(),{job}=await enqueue(s);
   await db.db.update(presentationJobs).set({status:'rendering',plan:pptPlan,sources:s.sources,attempts:1,leaseToken:randomUUID(),leaseUntil:new Date(Date.now()-1000)}).where(eq(presentationJobs.id,job.id));
   const foreign=createPresentationService(db,s.storage,s.model,s.collect,{...s.config,PPT_SCOPE:'foreign'});expect(await foreign.processOne()).toBe(false);
   expect(await s.service.processOne()).toBe(true);expect((await s.service.detail(job.id)).presentation.status).toBe('ready');expect(s.model.complete).not.toHaveBeenCalled();expect(s.collect).not.toHaveBeenCalled();
 },90000);
 it('lost lease cannot publish a plan or upload stale output; invalid content persists explicit failure',async()=>{
   const s=setup();let release!:()=>void,entered!:()=>void;const held=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
   s.collect.mockImplementationOnce(async()=>{entered();await held;return s.sources;});const {job}=await enqueue(s);const running=s.service.processOne();await started;
   try{await db.db.update(presentationJobs).set({leaseToken:randomUUID(),leaseUntil:new Date(Date.now()+300000)}).where(eq(presentationJobs.id,job.id));}finally{release();}
   await running;expect(s.put).not.toHaveBeenCalled();expect(s.model.complete).not.toHaveBeenCalled();expect((await s.service.detail(job.id)).plan).toBeNull();
   const bad=setup();bad.model.complete.mockResolvedValue({content:'{"slides":[]}',model:'STUB'});const failure=await enqueue(bad);await bad.service.processOne();expect((await bad.service.detail(failure.job.id)).presentation).toMatchObject({status:'failed',errorCode:'PPT_INVALID_PLAN'});expect(bad.put).not.toHaveBeenCalled();
 },90000);
 it('explicit replanning archives a failed draft, reuses the same task/key, and requires absent file',async()=>{
  const s=setup();s.put.mockImplementationOnce(async()=>{throw new PublicError(502,'STORAGE_UNAVAILABLE','STUB failure before upload');});
  const {job}=await enqueue(s);await s.service.processOne();expect((await s.service.detail(job.id)).presentation.status).toBe('failed');
  await s.service.retry(job.id,true);const reset=await s.service.detail(job.id);expect(reset.plan).toBeNull();expect(reset.planningHistory[0].plan).toEqual(pptPlan);
  await s.service.processOne();expect((await s.service.detail(job.id)).presentation.status).toBe('ready');expect(s.objects.size).toBe(1);expect(s.model.complete).toHaveBeenCalledTimes(2);
 },90000);

 async function amendment(){
  const s=setup(),{job}=await enqueue(s);await s.service.processOne();
  const original=(await s.service.download(job.id)).bytes;
  const plan=structuredClone(pptPlan);plan.slides[1].items.push({kind:'recommendation',text:'建议核实来源后安排后续工作',sourceIds:[]});
  const [row]=await db.db.select().from(presentationJobs).where(eq(presentationJobs.id,job.id));
  const {bytes}=await renderPresentation(plan,s.sources,row.topic,row.createdAt);
  return {s,job,original,input:{jobId:job.id,revisionId:randomUUID(),parentSha:sha256(original),plan,bytes}};
 }
 it('repair publication serializes competing parents, retains original, repeats idempotently and rejects stale revisions',async()=>{
  const {s,job,original,input}=await amendment();const publish=createRepairPublisher(db,s.storage,s.config.PPT_SCOPE);
  const result=await Promise.allSettled([publish(input),publish({...input,revisionId:randomUUID()})]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(s.objects.size).toBe(2);
  const [row]=await db.db.select().from(presentationJobs).where(eq(presentationJobs.id,job.id));const record=publicationSchema.parse((row.context as any).artifactPublication);
  expect(s.objects.get(record.parent.key)).toEqual(original);expect(record.state).toBe('published');
  const winning={...input,revisionId:record.id};await publish(winning);expect(s.objects.size).toBe(2);expect(s.put).toHaveBeenCalledTimes(2);
  await expect(publish({...winning,revisionId:randomUUID()})).rejects.toMatchObject({code:'PPT_PUBLICATION_CONFLICT'});
  expect((await s.service.download(job.id)).bytes).toEqual(input.bytes);
 },90000);
 it('repair lost upload acknowledgement resumes registered object without duplicate upload',async()=>{
  const {s,input}=await amendment();s.put.mockImplementationOnce(async(key,bytes)=>{s.objects.set(key,bytes);throw new Error('STUB lost acknowledgement');});
  const publish=createRepairPublisher(db,s.storage,s.config.PPT_SCOPE);await publish(input);await publish(input);
  expect(s.objects.size).toBe(2);expect(s.put).toHaveBeenCalledTimes(2);
 },90000);
 it('switch transaction rollback preserves downloadable parent and pending intent; recovery preserves other context keys',async()=>{
  const {s,job,original,input}=await amendment();let failed=false;
  const broken={...db,pool:{connect:async()=>{
   const client=await db.pool.connect();
   return {release:()=>client.release(),query:async(sql:string,args?:unknown[])=>{
    if(sql.startsWith('update presentation_jobs set object_key')&&!failed){failed=true;throw new Error('STUB transaction failure');}
    return client.query(sql,args);
   }};
  }}} as unknown as typeof db;
  await expect(createRepairPublisher(broken,s.storage,s.config.PPT_SCOPE)(input)).rejects.toThrow('STUB');
  expect((await s.service.download(job.id)).bytes).toEqual(original);
  const [row]=await db.db.select().from(presentationJobs).where(eq(presentationJobs.id,job.id));expect(publicationSchema.parse((row.context as any).artifactPublication).state).toBe('pending');
  await db.pool.query("update presentation_jobs set context=jsonb_set(context,'{unrelatedWorkerNote}','\"preserved\"'::jsonb) where id=$1",[job.id]);
  await createRepairPublisher(db,s.storage,s.config.PPT_SCOPE)(input);
  const [after]=await db.db.select().from(presentationJobs).where(eq(presentationJobs.id,job.id));expect((after.context as any).unrelatedWorkerNote).toBe('preserved');
  expect((await s.service.download(job.id)).bytes).toEqual(input.bytes);expect(s.put).toHaveBeenCalledTimes(2);
 },90000);
 it('bad candidate cannot switch parent or publish a false plan',async()=>{
  const {s,job,original,input}=await amendment();await expect(createRepairPublisher(db,s.storage,s.config.PPT_SCOPE)({...input,bytes:original})).rejects.toMatchObject({code:'PPT_PUBLICATION_BYTES'});
  expect(s.objects.size).toBe(1);expect((await s.service.download(job.id)).bytes).toEqual(original);
 },90000);
});
