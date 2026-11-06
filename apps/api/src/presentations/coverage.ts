import type {PptPlan,PptSource} from '../../../../shared/presentations.js';
import type {PresentationBrief} from './intent.js';
import {quoteOptions} from './evidence.js';
import {PublicError} from '../errors.js';

export interface RequiredQuote {sourceId:string;quote:string;field:'project'|'owner'|'accessCode'|'risk'|'decision'|'proposal'|'todo'}
export const presentationMetadata=(text:string)=>/^ContextPilot - Synthetic RAG Acceptance|^This document contains synthetic facts|\| Page \d+ \| Synthetic test data only|^CORPUS-STUB/i.test(text);
// These are source fields, not ORCHID/Node.js special cases. Preserve whole quotes;
// no inferred owner/date or invented text is admitted into a requirement.
export function requiredContent(sources:PptSource[]):RequiredQuote[]{
 const required:RequiredQuote[]=[];
 const add=(s:PptSource,field:RequiredQuote['field'],quote:string|undefined)=>{
  if(quote&&!required.some(r=>r.quote===quote))required.push({sourceId:s.id,quote,field});
 };
 for(const s of sources){
  const choices=quoteOptions(s);
  if(s.kind==='pdf'||s.kind==='meeting'){
   for(const [field,pattern] of [['project',/^(?:Project reference|项目(?:编号|代号|名称))[：:]/i],['owner',/项目总负责人|项目负责人|\bowner\b/i],['accessCode',/launch access code|访问码|准入码/i]] as const)add(s,field,choices.find(q=>pattern.test(q)));
   if(s.locator.discussionCategory==='decision'||(/^决策[：:]/.test(String((s.locator.evidence as {quote?:string})?.quote))))add(s,'decision',choices.find(q=>q===s.text)??choices[0]);
   if(s.locator.discussionCategory==='proposal')add(s,'proposal',choices.find(q=>q===s.text)??choices[0]);
  }
  if(s.kind==='meeting_risk')add(s,'risk',choices[0]);
  if(s.kind==='todo'&&s.classification==='fact'&&s.locator.userEdited===true){
   if(!choices.includes(s.text))throw new PublicError(422,'PPT_REQUIRED_FACT_TOO_DENSE','人工待办超过单页完整引用容量，请缩小资料或人工归纳，未截断事实。');
   add(s,'todo',s.text);
  }
 }
 return required;
}
export function coverageSlots(sources:PptSource[],contentPages:number){
 const requirements=requiredContent(sources),slots:{purpose:string;requiredQuotes:RequiredQuote[]}[]=[];
 for(const todo of [false,true]){
  const priority=['project','owner','accessCode','risk','decision','proposal','todo'];
  const group=requirements.filter(r=>(r.field==='todo')===todo).sort((a,b)=>priority.indexOf(a.field)-priority.indexOf(b.field));
  for(let start=0;start<group.length;start+=3)slots.push({purpose:todo?'最新人工待办（纯待办表格）':'必须展示的来源事实/分析/提议',requiredQuotes:group.slice(start,start+3)});
 }
 if(slots.length>contentPages)throw new PublicError(422,'PPT_COVERAGE_CAPACITY','指定页数不足以展示必需事实与人工待办，请增加页数或缩小资料范围。');
 return slots;
}
function meaningfulTerms(topic:string){
 const clean=topic.replace(/如何|提高|提升|关于|培训|方法|指南|效率|技巧|报告|汇报|团队|企业/g,'');
 return [...clean.matchAll(/[a-zA-Z]{3,}|[\p{Script=Han}]{2,}/gu)].flatMap(m=>/[a-z]/i.test(m[0])?[m[0].toLowerCase()]:Array.from({length:m[0].length-1},(_,i)=>m[0].slice(i,i+2)));
}
export function verifyContentQuality(plan:PptPlan,sources:PptSource[],brief?:PresentationBrief){
 const items=plan.slides.slice(1,-1).flatMap(s=>s.items),requirements=requiredContent(sources);
 if(items.some(i=>i.kind==='quote'&&presentationMetadata(i.quote)))throw new PublicError(502,'PPT_NON_BUSINESS_CONTENT','测试页眉/元数据不能作为业务进展或风险，未生成文件。');
 for(const item of items)if(item.kind==='analysis'||item.kind==='recommendation'){
  const linked=sources.filter(s=>item.sourceIds.includes(s.id));
  const uncertain=linked.some(s=>/并非已确认|尚未获批|未获批准|不确认新的/.test(s.text));
  const assertsApproval=/(?:已(?:经)?(?:正式)?(?:批准|获批|确认|确定).{0,6}(?:改期|延期)|(?:改期|延期).{0,6}已(?:经)?(?:正式)?(?:批准|获批|确认|确定)|正式决定(?:改期|延期))/.test(item.text);
  if(uncertain&&assertsApproval&&!/并非|而非|不是|不得|不能|不等于|尚未|未获/.test(item.text))throw new PublicError(502,'PPT_UNSUPPORTED_DECISION','分析把未确认风险或未批准提议写成了决定，未生成文件。');
 }
 for(const item of items)if(item.kind==='gap'){
  const contradiction=item.text==='现有资料不足以确认风险'&&sources.some(s=>s.kind==='meeting_risk')
   ||item.text==='未提供负责人或明确时间'&&sources.some(s=>s.kind==='todo'&&s.owner&&s.dueDate)
   ||item.text==='尚无可引用的业务资料'&&sources.some(s=>!['request','chat'].includes(s.kind));
  if(contradiction)throw new PublicError(502,'PPT_CONTRADICTORY_GAP','缺口陈述与现有证据冲突，未生成文件。');
 }
 for(const requirement of requirements){
  const matching=plan.slides.slice(1,-1).find(p=>p.items.some(i=>i.kind==='quote'&&i.sourceId===requirement.sourceId&&i.quote===requirement.quote));
  if(!matching)throw new PublicError(502,'PPT_REQUIRED_FACT_MISSING',`大纲遗漏必需来源字段（${requirement.field}），未生成文件。`);
  if(requirement.field==='todo'&&matching.kind!=='todos')throw new PublicError(502,'PPT_TODO_LAYOUT_REQUIRED','人工待办必须在正文待办表格中完整显示负责人和截止时间。');
 }
 if(brief?.mode==='training'&&sources.every(s=>s.kind==='request'||s.kind==='chat')){
  const terms=meaningfulTerms(brief.topic+' '+brief.requirements.join(' '));
  for(const page of plan.slides.slice(1,-1)){
   const texts=page.items.map(i=>i.kind==='quote'?i.quote:i.text);
   if(texts.some(t=>/(?:建议|可以|应当)(?:制作|编写|设计).{0,12}(?:培训|课程|PPT|幻灯片)|(?:建议|可以)(?:围绕.{0,40}(?:展开|组织).{0,10}(?:培训|课程)|结合.{0,20}(?:场景|案例).{0,5}举例|(?:介绍|说明).{0,20}(?:培训|课程|价值))|培训目标.{0,6}设定|展开整场.{0,6}培训/i.test(t)))throw new PublicError(502,'PPT_META_GUIDANCE','培训正文含创作指导，需生成直接面向观众的成品内容。');
   if(page.items.some(i=>i.kind==='gap')||!texts.some(t=>t.length>=12)||terms.length>0&&!terms.some(term=>texts.join('\n').toLowerCase().includes(term)))throw new PublicError(502,'PPT_CONTENT_IRRELEVANT','培训页面缺少与主题直接相关的实质内容，未生成文件。');
  }
 }
}
