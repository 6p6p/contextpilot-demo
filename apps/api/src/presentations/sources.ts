import { and, desc, eq, sql, inArray } from 'drizzle-orm';
import { presentationContextSchema, pptSourceSchema, type PptSource } from '../../../../shared/presentations.js';
import { conversations, messages, meetings, meetingAnalyses, meetingRisks, meetingTodos, riskEvidence, presentationJobs as jobs } from '../db/schema.js';
import type { presentationJobs } from '../db/schema.js';
import type { Database } from '../knowledge/service.js';
import type { createRetriever } from '../knowledge/retrieval.js';
import type { MemoryService } from '../memory/service.js';
import { publicQuery, type SearchProvider } from '../search/service.js';
import { PublicError } from '../errors.js';
import {visible} from '../management.js';
import {untrustedInstruction} from '../evidence/policy.js';
import {officialWebSources} from './evidence.js';
import {normalizeMeetingDiscussion} from '../meetings/analysis.js';
import {selectedDocuments} from './documents.js';
import { isPresentationIntent, presentationNeedsWeb } from './intent.js';
export function presentationSourceQuery(request:string,kind:'pdf'|'memory') {
  const pattern=kind==='pdf'?/PDF(?:中|里|中的)?(.+?)(?=[、，,。]|以及|生成|$)/i:/(?:跨会话记忆|长期记忆)(?:中|里|中的)?(.+?)(?=[、，,。]|以及|生成|$)/;
  return request.match(pattern)?.[1]?.trim()||request;
}
export type SourceCollector=(job:typeof presentationJobs.$inferSelect,cachedWebSources?:PptSource[])=>Promise<PptSource[]>;
export function createPresentationSources(database:Database,_retrieve:ReturnType<typeof createRetriever>|null,memory:MemoryService|null,search:SearchProvider|null,readDocuments=(ids:string[])=>selectedDocuments(database,ids)):SourceCollector {
  return async (job,cachedWebSources)=>{
    const ctx=presentationContextSchema.parse({meetingId:job.context.meetingId,useMemory:job.context.useMemory,webQuery:job.context.webQuery,documentIds:job.context.documentIds,useChat:job.context.useChat});
    const sources:PptSource[]=[];
    const add=(source:Omit<PptSource,'id'|'classification'>&{classification?:PptSource['classification']})=>sources.push(pptSourceSchema.parse({id:`S${sources.length+1}`,classification:'fact',...source}));
    add({kind:'request',title:'用户要求（用户陈述）',text:job.request,locator:{conversationId:job.conversationId}});
    const [assistant]=await database.db.select({ordinal:messages.ordinal}).from(messages).where(eq(messages.id,job.assistantMessageId));
    if(!assistant)throw new PublicError(404,'PPT_MESSAGE_NOT_FOUND','PPT 对话来源不存在。');
    const history=ctx.useChat?await database.db.select().from(messages).where(and(eq(messages.conversationId,job.conversationId),eq(messages.role,'user'),eq(messages.status,'completed'),sql`${messages.ordinal}<${assistant.ordinal}-1`)).orderBy(desc(messages.ordinal)).limit(10):[];
    for(const m of history.reverse().filter(m=>!isPresentationIntent(m.content)))add({kind:'chat',title:'当前会话用户陈述',text:m.content,locator:{messageId:m.id,conversationId:m.conversationId,observedAt:m.createdAt.toISOString()}});
    if(ctx.meetingId) {
      const [meeting]=await database.db.select().from(meetings).where(and(eq(meetings.id,ctx.meetingId),visible(meetings,'archived_at')));
      if(!meeting||meeting.status!=='ready'||!meeting.currentAnalysisId)throw new PublicError(409,'PPT_MEETING_NOT_READY','请选择已完成分析的会议。');
      const [analysis]=await database.db.select().from(meetingAnalyses).where(eq(meetingAnalyses.id,meeting.currentAnalysisId));
      if(!analysis)throw new PublicError(409,'PPT_MEETING_NOT_READY','会议分析不可用。');
      const locator={meetingId:meeting.id,analysisId:analysis.id,version:analysis.version};
      const result=normalizeMeetingDiscussion(analysis.result,meeting.transcript);
      for(const fact of [result.topic,result.meetingDate,result.location,...result.participants].filter(f=>f!==null))add({kind:'meeting',title:meeting.filename,text:fact.value,locator:{...locator,evidence:fact.evidence}});
      for(const fact of result.decisions)add({kind:'meeting',title:meeting.filename,text:fact.value,locator:{...locator,discussionCategory:'decision',evidence:fact.evidence}});
      for(const fact of result.topics.filter(f=>f.category==='proposal'&&f.scope!=='background'))add({kind:'meeting',title:meeting.filename,text:fact.value,locator:{...locator,discussionCategory:'proposal',evidence:fact.evidence}});
      const risks=await database.db.select().from(meetingRisks).where(eq(meetingRisks.analysisId,analysis.id));
      for(const risk of risks) {
        const evidence=await database.db.select().from(riskEvidence).where(eq(riskEvidence.riskId,risk.id));
        if(evidence.some(e=>untrustedInstruction(e.quote)))continue;
        add({kind:'meeting_risk',title:`${meeting.filename} · 风险评估`,classification:'analysis',text:`${risk.description}\n潜在影响：${risk.impact}`,riskLevel:risk.level as PptSource['riskLevel'],locator:{...locator,riskId:risk.id,evidence}});
      }
      const todos=await database.db.select().from(meetingTodos).where(and(eq(meetingTodos.meetingId,meeting.id),visible(meetingTodos,'dismissed_at')));
      for(const todo of todos.filter(t=>t.origin!=='meeting_question'&&!untrustedInstruction(t.evidence.quote)))add({kind:'todo',title:`${meeting.filename} · 已保存待办`,classification:todo.origin==='risk_followup'?'recommendation':'fact',text:todo.task,owner:todo.owner,dueDate:todo.dueDate,locator:{...locator,todoId:todo.id,todoVersion:todo.version,todoAnalysisId:todo.analysisId,origin:todo.origin,status:todo.status,userEdited:todo.userEdited,evidence:todo.evidence}});
    } else if(/根据.{0,30}会议|这次会议|本次会议|上述会议/.test(job.request))throw new PublicError(400,'PPT_MEETING_SELECTION_REQUIRED','请在聊天区 PPT 资料中明确选择本次会议，不会猜测最近一场会议。');
    if(ctx.documentIds?.length) {
      const rows=await readDocuments(ctx.documentIds);
      for(const s of rows)add({kind:'pdf',title:`${s.filename} · 第 ${s.page} 页`,text:s.text,locator:{sourceId:s.sourceId,documentId:s.documentId,page:s.page,selection:'explicit'}});
    }
    if(ctx.useMemory) {
      if(!memory)throw new PublicError(503,'PPT_MEMORY_NOT_CONFIGURED','长期记忆未配置。');
      const rows=await memory.retrieve(presentationSourceQuery(job.request,'memory'));
      for(const s of rows)add({kind:'memory',title:'长期记忆（历史陈述，可能过时）',text:s.content,locator:{memoryId:s.id,provenance:s.sources}});
    }
    if(presentationNeedsWeb(job.request,'auto',null)&&!ctx.webQuery)throw new PublicError(400,'PPT_PUBLIC_QUERY_REQUIRED','最新外部资料需明确填写独立公共搜索词；不会使用私有生成指令搜索或猜测最新事实。');
    const wantsWeb=presentationNeedsWeb(job.request,job.context.searchMode,ctx.webQuery);
    if(wantsWeb) {
      if(job.context.searchMode==='off')throw new PublicError(400,'PPT_SEARCH_OFF','请求包含最新外部信息，但联网已关闭。');
      if(!ctx.webQuery)throw new PublicError(400,'PPT_PUBLIC_QUERY_REQUIRED','请在 PPT 资料中提供不含私有资料的独立公共搜索词。不会将 PPT 请求或内部资料发送给搜索。');
      const query=publicQuery(ctx.webQuery);
      let cached=cachedWebSources?.filter(s=>s.kind==='web'&&s.locator.query===query);
      if(!cached?.length){
        const recent=await database.db.select({sources:jobs.sources}).from(jobs).where(and(eq(jobs.scope,job.scope),eq(jobs.storageOrigin,job.storageOrigin),eq(jobs.storageBucket,job.storageBucket),sql`${jobs.createdAt}>now()-interval '30 minutes'`)).orderBy(desc(jobs.createdAt)).limit(20);
        cached=recent.flatMap(r=>r.sources??[]).filter(s=>s.kind==='web'&&s.locator.query===query&&typeof s.locator.queriedAt==='string'&&Date.now()-Date.parse(s.locator.queriedAt)<1800000).filter((s,i,a)=>a.findIndex(other=>other.locator.url===s.locator.url)===i);
      }
      if(cached?.length){for(const s of cached){const {id,...source}=s;add(source);}}
      else {
      if(!search)throw new PublicError(503,'SEARCH_NOT_CONFIGURED','联网搜索未配置。');
      const rows=await search.search(query);
      if(!rows.length)throw new PublicError(422,'PPT_SEARCH_EMPTY','搜索没有可用来源，未生成最新信息。');
      for(const s of rows)add({kind:'web',title:s.title,text:s.summary,locator:{url:s.url,query,queriedAt:s.queriedAt,publishedAt:s.publishedAt}});
      }
    }
    if(sources.length>48||JSON.stringify(sources).length>36000)throw new PublicError(422,'PPT_SOURCE_LIMIT','来源超过单次上下文上限，请缩小主题或减少来源范围。');
    return officialWebSources(sources);
  };
}

// Re-read only explicitly selected todo IDs. A persisted source snapshot is evidence,
// not authority to publish stale/ignored content after a user edit during planning.
export async function assertCurrentPresentationTodos(database:{db:Pick<Database['db'],'select'>},sources:PptSource[],lock=false){
 const selected=sources.filter(s=>s.kind==='todo');if(!selected.length)return;
 const ids=selected.map(s=>String(s.locator.todoId));
 const query=database.db.select().from(meetingTodos).where(inArray(meetingTodos.id,ids));
 const rows=await (lock?query.for('share'):query);
 for(const s of selected){const row=rows.find(r=>r.id===s.locator.todoId);
  if(!row||row.dismissedAt||row.meetingId!==s.locator.meetingId||row.version!==s.locator.todoVersion||row.task!==s.text||row.owner!==s.owner||row.dueDate!==s.dueDate||row.status!==s.locator.status)throw new PublicError(409,'PPT_TODO_SOURCE_CHANGED','已选待办在规划期间发生变化或被忽略，请复核后创建新任务；未发布旧内容。');
 }
}
