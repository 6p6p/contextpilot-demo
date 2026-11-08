import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, lt, or, sql } from 'drizzle-orm';
import { presentationJobs } from '../db/schema.js';
import type { Database } from '../knowledge/service.js';
import type { PrivateStorage } from '../knowledge/storage.js';
import type { ChatModel } from '../llm/adapter.js';
import type { Env } from '../config/env.js';
import { presentationContextSchema } from '../../../../shared/presentations.js';
import type { PresentationContext } from '../../../../shared/presentations.js';
import {publicQuery} from '../search/service.js';
import type { SearchMode } from '../../../../shared/search.js';
import { PublicError } from '../errors.js';
import { parsePresentationRequest } from './intent.js';
import {assertCurrentPresentationTodos,type SourceCollector} from './sources.js';
import {contentPageCount,verifyContentQuality} from './coverage.js';
import { planPresentation, verifyPlan, validatePresentationContent } from './plan.js';
import { renderPresentation, PPTX_MIME, validatePptx } from './render.js';
type Tx=Parameters<Parameters<Database['db']['transaction']>[0]>[0];
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
export interface PresentationInput {content:string;knowledgeMode?:boolean;documentIds?:string[];searchMode?:SearchMode;presentationContext?:PresentationContext}
const context=(i:PresentationInput)=>{
 const selected=presentationContextSchema.parse(i.presentationContext??{});
 const explicitQuery=i.content.match(/(?:联网|网络)(?:查询|搜索)?[：:\s]*(.+?)(?=[，。；]|并(?:生成|制作)|$)/)?.[1]?.trim();
 const webQuery=selected.webQuery||(explicitQuery?publicQuery(explicitQuery):null);
 if(webQuery&&i.searchMode==='off')throw new PublicError(400,'PPT_SEARCH_OFF','联网已关闭，请调整搜索模式后再使用公共联网资料。');
 return {...selected,webQuery,documentIds:selected.documentIds??[],useChat:selected.useChat||/根据.{0,25}(?:刚才(?:的)?讨论|对话|聊天|上文)/.test(i.content),useMemory:selected.useMemory||/长期记忆|跨会话记忆/.test(i.content),knowledgeMode:Boolean(selected.documentIds?.length),searchMode:(webQuery?'required':'off') as SearchMode};
};
export function createPresentationService(database:Database,storage:PrivateStorage|null,model:ChatModel|null,collect:SourceCollector,env:Pick<Env,'PPT_SCOPE'|'PPT_MAX_TOKENS'> & {PPT_MAX_PAGES?:number},shutdown?:AbortSignal) {
  const db=database.db;
  const scope=eq(presentationJobs.scope,env.PPT_SCOPE);
  const configured=()=>{if(!storage||!storage.find||!model)throw new PublicError(503,'PPT_NOT_CONFIGURED','PPT 需要配置模型和支持核查的私有 Storage。');};
  const scoped=storage?and(scope,eq(presentationJobs.storageOrigin,storage.origin),eq(presentationJobs.storageBucket,storage.bucket)):scope;
  const project=(row:typeof presentationJobs.$inferSelect)=>({id:row.id,assistantMessageId:row.assistantMessageId,conversationId:row.conversationId,filename:row.filename,pageCount:row.pageCount,pageMode:parsePresentationRequest(row.request,{maxPages:30}).pageMode,status:row.status,errorCode:row.errorCode,errorMessage:row.errorMessage,retries:row.retries,size:row.size,createdAt:row.createdAt,updatedAt:row.updatedAt});
  async function row(id:string) {const [r]=await db.select().from(presentationJobs).where(and(scoped,eq(presentationJobs.id,id)));if(!r)throw new PublicError(404,'PPT_NOT_FOUND','PPT 任务不存在或配置范围不匹配。');return r;}
  const fingerprint=(input:PresentationInput)=>hash(JSON.stringify({content:input.content,context:context(input)}));
  return {
    requireConfigured:configured,
    async validateReplay(tx:Tx,assistantMessageId:string,input:PresentationInput){const [job]=await tx.select().from(presentationJobs).where(eq(presentationJobs.assistantMessageId,assistantMessageId));if(!job||job.requestHash!==fingerprint(input))throw new PublicError(409,'REQUEST_CONFLICT','同一请求标识不能修改 PPT 来源范围。');},
    async enqueue(tx:Tx,assistantMessageId:string,conversationId:string,input:PresentationInput){
      configured();const ctx=context(input);const parsed=parsePresentationRequest(input.content,{maxPages:env.PPT_MAX_PAGES,sourceCount:(ctx.documentIds?.length??0)+Number(!!ctx.meetingId)});
      if(/(?:根据|依据|使用).{0,20}PDF/i.test(input.content)&&!ctx.documentIds?.length)throw new PublicError(400,'PPT_DOCUMENT_SELECTION_REQUIRED','请使用聊天输入框旁的 + 选择本次 PDF；不会使用其他历史文件。');
      if(parsed.pageCount<5||parsed.pageCount>10){const check=await tx.execute(sql`select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='presentation_jobs'::regclass and conname='presentation_page_count_check'`);if(!String(check.rows[0]?.definition).includes('30'))throw new PublicError(503,'PPT_PAGE_LIMIT_MIGRATION_REQUIRED','页数范围需已审查的0011迁移；本次未创建任务。');}
      if(/根据.{0,30}会议|这次会议|本次会议|上述会议/.test(input.content)&&!ctx.meetingId)throw new PublicError(400,'PPT_MEETING_SELECTION_REQUIRED','请明确选择要引用的会议。');
      const id=randomUUID();
      await tx.insert(presentationJobs).values({id,scope:env.PPT_SCOPE,assistantMessageId,conversationId,request:input.content,requestHash:fingerprint(input),context:ctx,topic:parsed.topic,pageCount:parsed.pageCount,objectKey:`presentations/${id}.pptx`,storageOrigin:storage!.origin,storageBucket:storage!.bucket,filename:`ContextPilot-${id}.pptx`});
      return id;
    },
    list:async(conversationId?:string)=> (await db.select().from(presentationJobs).where(and(scoped,conversationId?eq(presentationJobs.conversationId,conversationId):undefined)).orderBy(desc(presentationJobs.createdAt)).limit(100)).map(project),
    async detail(id:string){const r=await row(id);return {presentation:project(r),plan:r.plan,sources:r.sources,planningHistory:r.context.planningHistory??[],planningOutput:r.context.planningOutput??null};},
    async retry(id:string,replan=false){configured();const r=await row(id);if(r.status!=='failed'||r.retries>=1)throw new PublicError(409,'PPT_RETRY_NOT_ALLOWED','仅允许对失败任务显式重试一次。');
      replan=replan||(!r.plan&&Boolean(r.context.planningOutput)&&/^PPT_(?:INVALID|REPEATED|CONTRADICTORY|REQUIRED|SOURCE|INCOMPLETE|META|CONTENT)/.test(r.errorCode??''));
      if(replan&&await storage!.find!(r.objectKey))throw new PublicError(409,'PPT_REPLAN_FILE_EXISTS','已有文件时禁止重新规划或覆盖；可按原计划重试核查。');
      const refreshed=replan?await collect(r,r.sources?.filter(s=>s.kind==='web')):r.sources;
      const replanning=replan?{sources:refreshed,context:{...r.context,planningOutput:undefined,planningHistory:[...(r.context.planningHistory??[]),{sources:r.sources,output:r.context.planningOutput,plan:r.plan,sha256:r.sha256,errorCode:r.errorCode,recordedAt:new Date().toISOString()}]},plan:null,sha256:null,size:null}:{};
      const [updated]=await db.update(presentationJobs).set({...replanning,status:'queued',attempts:0,retries:r.retries+1,leaseToken:null,leaseUntil:null,errorCode:null,errorMessage:null,updatedAt:new Date()}).where(and(scoped,eq(presentationJobs.id,id),eq(presentationJobs.status,'failed'),eq(presentationJobs.retries,r.retries))).returning();
      if(!updated)throw new PublicError(409,'PPT_RETRY_CONFLICT','任务状态已改变，请刷新。');return project(updated);},
    async download(id:string){configured();const r=await row(id);if(r.status!=='ready'||!r.sha256||!r.size)throw new PublicError(409,'PPT_NOT_READY','PPT 尚未完成。');
      verifyPlan(r.plan,r.pageCount,r.sources??[]);
      const bytes=await storage!.find!(r.objectKey);if(!bytes||bytes.length!==r.size||hash(bytes)!==r.sha256)throw new PublicError(502,'PPT_FILE_MISMATCH','PPT 文件丢失或校验失败。');await validatePptx(bytes,r.pageCount);return {filename:r.filename,bytes};},
    async processOne(){
      if(!storage?.find||!model||shutdown?.aborted)return false;
      const now=new Date();
      await db.update(presentationJobs).set({status:'failed',errorCode:'PPT_INTERRUPTED',errorMessage:'两次处理中断，停止自动恢复。',leaseUntil:null,updatedAt:now}).where(and(scoped,or(eq(presentationJobs.status,'planning'),eq(presentationJobs.status,'rendering')),lt(presentationJobs.leaseUntil,now),sql`${presentationJobs.attempts}>=2`));
      const job=await db.transaction(async tx=>{
        const [r]=await tx.select().from(presentationJobs).where(and(scoped,sql`${presentationJobs.attempts}<2`,or(eq(presentationJobs.status,'queued'),and(or(eq(presentationJobs.status,'planning'),eq(presentationJobs.status,'rendering')),lt(presentationJobs.leaseUntil,now))))).orderBy(asc(presentationJobs.createdAt)).limit(1).for('update',{skipLocked:true});
        if(!r)return null;const token=randomUUID();
        await tx.update(presentationJobs).set({status:r.plan?'rendering':'planning',leaseToken:token,leaseUntil:new Date(Date.now()+300000),attempts:r.attempts+1,updatedAt:now}).where(eq(presentationJobs.id,r.id));return {...r,token};
      });
      if(!job)return false;
      const owns=and(scoped,eq(presentationJobs.id,job.id),eq(presentationJobs.leaseToken,job.token),or(eq(presentationJobs.status,'planning'),eq(presentationJobs.status,'rendering')));
      async function save(patch:Partial<typeof presentationJobs.$inferInsert>){const result=await db.update(presentationJobs).set({...patch,updatedAt:new Date()}).where(owns).returning({id:presentationJobs.id});if(!result.length)throw new PublicError(409,'PPT_LEASE_LOST','PPT 任务租约已失效。');}
      const heartbeat=setInterval(()=>{void db.update(presentationJobs).set({leaseUntil:new Date(Date.now()+300000)}).where(owns).catch(()=>{});},30000);
      try {
        const sources=job.sources??await collect(job);if(shutdown?.aborted)return false;
        if(!job.sources)await save({sources});
        await assertCurrentPresentationTodos(database,sources);
        const resolvedCount=job.plan?job.pageCount:contentPageCount(job.request,sources,env.PPT_MAX_PAGES??20);
        if(resolvedCount!==job.pageCount)await save({pageCount:resolvedCount});
        const brief={...parsePresentationRequest(job.request,{maxPages:30}),pageCount:resolvedCount};
        const plan=job.plan??(job.context.planningOutput?validatePresentationContent(job.context.planningOutput,resolvedCount,sources,brief):await planPresentation(model,job.request,resolvedCount,sources,env.PPT_MAX_TOKENS,async output=>{await save({context:{...job.context,planningOutput:output}});},job.context.planningHistory?.at(-1)?.output?{output:job.context.planningHistory.at(-1)!.output!,errorCode:job.context.planningHistory.at(-1)!.errorCode??'PPT_INVALID_PLAN'}:undefined));if(shutdown?.aborted)return false;
        verifyPlan(plan,resolvedCount,sources);
        verifyContentQuality(plan,sources,brief);
        await save({plan,status:'rendering'});
        const {bytes}=await renderPresentation(plan,sources,job.topic,job.createdAt);const sha256=hash(bytes);
        if(job.sha256&&job.sha256!==sha256)throw new PublicError(409,'PPT_RENDER_VERSION_MISMATCH','已记录文件与当前渲染不一致，禁止覆盖。');
        await save({sha256,size:bytes.length});if(shutdown?.aborted)return false;
        const existing=await storage.find(job.objectKey);
        if(existing&&hash(existing)!==sha256)throw new PublicError(409,'PPT_OBJECT_CONFLICT','私有 Storage 已有不同内容，未覆盖。');
        if(!existing)await storage.put(job.objectKey,bytes,PPTX_MIME);
        const actual=await storage.find(job.objectKey);
        if(!actual||actual.length!==bytes.length||hash(actual)!==sha256)throw new PublicError(502,'PPT_UPLOAD_UNVERIFIED','上传内容未通过读取校验，未发布下载。');
        if(shutdown?.aborted)return false;
        await db.transaction(async tx=>{
          await assertCurrentPresentationTodos({db:tx},sources,true);
          const result=await tx.update(presentationJobs).set({status:'ready',leaseUntil:null,errorCode:null,errorMessage:null,updatedAt:new Date()}).where(owns).returning({id:presentationJobs.id});
          if(!result.length)throw new PublicError(409,'PPT_LEASE_LOST','PPT 任务租约已失效。');
        });
      }catch(error){if(shutdown?.aborted)return false;await db.update(presentationJobs).set({status:'failed',errorCode:error instanceof PublicError?error.code:'PPT_GENERATION_FAILED',errorMessage:error instanceof PublicError?error.message:'PPT 生成失败，请查看配置并人工决定是否重试。',leaseUntil:null,updatedAt:new Date()}).where(owns);}
      finally{clearInterval(heartbeat);}
      return true;
    },
  };
}
export type PresentationService=ReturnType<typeof createPresentationService>;
