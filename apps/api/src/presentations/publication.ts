import {z} from 'zod';
import {createHash,randomUUID} from 'node:crypto';
import type {Database} from '../knowledge/service.js';
import type {PrivateStorage} from '../knowledge/storage.js';
import type {PptPlan,PptSource} from '../../../../shared/presentations.js';
import {verifyPlan} from './plan.js';
import {renderPresentation,validatePptx,PPTX_MIME} from './render.js';
import {PublicError} from '../errors.js';
const file=z.object({key:z.string().min(1),sha:z.string().regex(/^[a-f0-9]{64}$/),size:z.number().int().positive(),planSha:z.string().length(64)}).strict();
export const publicationSchema=z.object({id:z.uuid(),state:z.enum(['pending','published']),parent:file,candidate:file,createdAt:z.iso.datetime(),publishedAt:z.iso.datetime().optional()}).strict();
export type Publication=z.infer<typeof publicationSchema>;
export const sha256=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical((v as Record<string,unknown>)[k])])):v;
export const planSha=(v:unknown)=>sha256(JSON.stringify(canonical(v)));
// Narrow operator-only, one reviewed amendment per ready job. No HTTP or model integration.
export function createRepairPublisher(database:Database,storage:PrivateStorage,scope:string){
 const conflict=()=>new PublicError(409,'PPT_PUBLICATION_CONFLICT','发布记录或父版本不匹配，未切换文件。');
 return async(input:{jobId:string;revisionId:string;parentSha:string;plan:PptPlan;bytes:Buffer})=>{
  const digest=sha256(input.bytes),revisionPlan=planSha(input.plan);
  const locked=async<T>(action:(row:any,query:(sql:string,args:unknown[])=>Promise<unknown>)=>Promise<T>)=>{
   const client=await database.pool.connect();try{await client.query('begin');
    const {rows}=await client.query('select * from presentation_jobs where id=$1 and scope=$2 and storage_origin=$3 and storage_bucket=$4 for update',[input.jobId,scope,storage.origin,storage.bucket]);
    if(!rows[0]||rows[0].status!=='ready')throw conflict();
    const result=await action(rows[0],(s,a)=>client.query(s,a));await client.query('commit');return result;
   }catch(e){await client.query('rollback');throw e;}finally{client.release();}
  };
  const record=await locked(async(r,q)=>{
   verifyPlan(input.plan,r.page_count,r.sources as PptSource[]);
   const rendered=await renderPresentation(input.plan,r.sources,r.topic,r.created_at);
   if(sha256(rendered.bytes)!==digest)throw new PublicError(422,'PPT_PUBLICATION_BYTES','修复规划与候选文件不一致。');
   if(r.context.artifactPublication){const old=publicationSchema.parse(r.context.artifactPublication);
    if(old.id!==input.revisionId||old.parent.sha!==input.parentSha||old.candidate.sha!==digest||old.candidate.planSha!==revisionPlan)throw conflict();
    const expected=old.state==='published'?old.candidate:old.parent;
    if(r.object_key!==expected.key||r.sha256!==expected.sha||r.size!==expected.size||planSha(r.plan)!==expected.planSha)throw conflict();return old;
   }
   if(r.sha256!==input.parentSha||!r.sha256||!r.size)throw conflict();
   const record=publicationSchema.parse({id:input.revisionId,state:'pending',parent:{key:r.object_key,sha:r.sha256,size:r.size,planSha:planSha(r.plan)},candidate:{key:`presentations/repairs/${randomUUID()}.pptx`,sha:digest,size:input.bytes.length,planSha:revisionPlan},createdAt:new Date().toISOString()});
   await q("update presentation_jobs set context=jsonb_set(context,'{artifactPublication}',$2::jsonb,true) where id=$1",[input.jobId,JSON.stringify(record)]);return record;
  });
  // Every possible object is registered durably before upload. Immutable put, no deletes.
  let actual=await storage.find!(record.candidate.key);
  if(!actual){try{await storage.put(record.candidate.key,input.bytes,PPTX_MIME);}catch(error){actual=await storage.find!(record.candidate.key);if(!actual)throw error;}}
  actual=await storage.find!(record.candidate.key);
  if(!actual||sha256(actual)!==digest||actual.length!==record.candidate.size)throw new PublicError(502,'PPT_PUBLICATION_UNVERIFIED','候选文件未通过读取校验，当前引用未改变。');
  await validatePptx(actual,input.plan.slides.length);
  return locked(async(r,q)=>{
   const current=publicationSchema.parse(r.context.artifactPublication);
   if(current.id!==record.id||current.candidate.sha!==digest||planSha(current.parent)!==planSha(record.parent)||planSha(current.candidate)!==planSha(record.candidate))throw conflict();
   if(current.state==='published'){if(r.object_key!==current.candidate.key||r.sha256!==digest||r.size!==current.candidate.size||planSha(r.plan)!==revisionPlan)throw conflict();return current;}
   if(r.object_key!==current.parent.key||r.sha256!==current.parent.sha||r.size!==current.parent.size||planSha(r.plan)!==current.parent.planSha)throw conflict();
   verifyPlan(input.plan,r.page_count,r.sources);
   const published=publicationSchema.parse({...current,state:'published',publishedAt:new Date().toISOString()});
   await q("update presentation_jobs set object_key=$2,sha256=$3,size=$4,plan=$5::jsonb,context=jsonb_set(context,'{artifactPublication}',$6::jsonb,true),updated_at=now() where id=$1",[input.jobId,published.candidate.key,digest,actual!.length,JSON.stringify(input.plan),JSON.stringify(published)]);
   return published;
  });
 };
}
