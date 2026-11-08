import type {PptPlan,PptSource} from '../../../../shared/presentations.js';
import {parsePresentationRequest as parseBrief,type PresentationBrief} from './intent.js';
import {quoteOptions} from './evidence.js';
import {PublicError} from '../errors.js';

export interface RequiredQuote {sourceId:string;quote:string;field:'project'|'owner'|'accessCode'|'risk'|'decision'|'proposal'|'todo'}
export const presentationMetadata=(text:string)=>/^ContextPilot - Synthetic RAG Acceptance|^This document contains synthetic facts|\| Page \d+ \| Synthetic test data only|^CORPUS-STUB|^Corpus v\d+ - Synthetic|^Synthetic data only|^UNTRUSTED TEXT:/i.test(text);
// These are source fields, not ORCHID/Node.js special cases. Preserve whole quotes;
// no inferred owner/date or invented text is admitted into a requirement.
export function requiredContent(sources:PptSource[]):RequiredQuote[]{
 const required:RequiredQuote[]=[];
 const add=(s:PptSource,field:RequiredQuote['field'],quote:string|undefined)=>{
  if(quote&&!required.some(r=>r.quote===quote))required.push({sourceId:s.id,quote,field});
 };
 for(const s of sources){
  const choices=quoteOptions(s).filter(q=>!presentationMetadata(q));
  if(s.kind==='pdf'||s.kind==='meeting'){
   for(const [field,pattern] of [['project',/^(?:Project reference|项目(?:编号|代号|名称))[：:]/i],['owner',/项目总负责人|项目负责人|\bowner\b/i],['accessCode',/launch access code|访问码|准入码/i]] as const)add(s,field,choices.find(q=>pattern.test(q)));
   if(s.locator.discussionCategory==='decision'||(/^决策[：:]/.test(String((s.locator.evidence as {quote?:string})?.quote))))add(s,'decision',choices.find(q=>q===s.text)??choices[0]);
   if(s.locator.discussionCategory==='proposal')add(s,'proposal',choices.find(q=>q===s.text)??choices[0]);
  }
  if(s.kind==='meeting_risk')add(s,'risk',choices[0]);
  if(s.kind==='todo'&&s.classification==='fact'){
   if(!choices.includes(s.text))throw new PublicError(422,'PPT_REQUIRED_FACT_TOO_DENSE','人工待办超过单页完整引用容量，请缩小资料或人工归纳，未截断事实。');
   add(s,'todo',s.text);
  }
 }
 const identity=(r:RequiredQuote)=>{
   if(r.field==='owner') {
     const owner=r.quote.match(/(?:\bowner\b[^:]*?:|\bowner\b.*?\bis\b|(?:项目)?(?:总)?负责人[：:])\s*(.+?)(?=[；;]|$)/i)?.[1];
     if(owner)return 'owner:'+owner.split(/\.\s+(?:Delivery|Supplier|Project)/i)[0].replace(/[.。\s]/g,'').toLowerCase();
   }
   return r.field+':'+r.quote;
 };
 return required.filter((r,i,a)=>a.findIndex(t=>identity(t)===identity(r))===i);
}
export function coverageSlots(sources:PptSource[],contentPages:number){
 const requirements=requiredContent(sources),slots:{purpose:string;requiredQuotes:RequiredQuote[]}[]=[];
 const priority=['project','owner','accessCode','risk','decision','proposal','todo'];
 const group=[...requirements].sort((a,b)=>priority.indexOf(a.field)-priority.indexOf(b.field));
 for(let start=0;start<group.length;start+=3)slots.push({purpose:'相关事实、风险、未批准提议与最新待办（同页可合并）',requiredQuotes:group.slice(start,start+3)});
 if(slots.length>contentPages)throw new PublicError(422,'PPT_COVERAGE_CAPACITY',`指定${contentPages+2}页仅有${contentPages}个内容页，${requirements.length}项去重后的必需内容至少需要${slots.length}个内容页。请改用自动页数或增加页数；未删除事实。`);
 return slots;
}
function meaningfulTerms(topic:string){
 const clean=topic.replace(/如何|提高|提升|关于|培训|方法|指南|效率|技巧|报告|汇报|团队|企业/g,'');
 return [...clean.matchAll(/[a-zA-Z]{3,}|[\p{Script=Han}]{2,}/gu)].flatMap(m=>/[a-z]/i.test(m[0])?[m[0].toLowerCase()]:Array.from({length:m[0].length-1},(_,i)=>m[0].slice(i,i+2)));
}
export function verifyContentQuality(plan:PptPlan,sources:PptSource[],brief?:PresentationBrief){
 const items=plan.slides.slice(1,-1).flatMap(s=>s.items),requirements=requiredContent(sources);
 if(brief?.pageMode==='auto'){
  const seen=new Set<string>();
  for(const item of items){const key=item.kind+':'+(item.kind==='quote'?item.quote:item.text).replace(/\s/g,'');if(seen.has(key))throw new PublicError(502,'PPT_REPEATED_CONTENT','自动规划出现重复正文，未用重复内容凑页数。');seen.add(key);}
 }
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

export function contentPageCount(request:string,sources:PptSource[],maximum=30):number {
 const brief=parseBrief(request,{maxPages:maximum});
 if(brief.pageMode!=='auto'){coverageSlots(sources,brief.pageCount-2);return brief.pageCount;}
 const required=requiredContent(sources).length;
 const requirements=requiredContent(sources);
 const compact=(v:string)=>v.toLowerCase().replace(/[\s。.;；:：]/g,'');
 const candidates=sources.filter(s=>s.kind!=='request'&&s.classification!=='recommendation'&&!requiredContent([s]).length&&!requirements.some(r=>r.sourceId===s.id||compact(r.quote).includes(compact(s.text)))).flatMap(s=>{const evidence=s.locator.evidence;const quotes=quoteOptions(s).filter(q=>!presentationMetadata(q));if(evidence&&typeof evidence==='object'&&!Array.isArray(evidence)&&'quote' in evidence&&typeof evidence.quote==='string'&&quotes.includes(evidence.quote))return [evidence.quote];return quotes.slice(0,1);});
 const options=[...new Set(candidates)].sort((a,b)=>b.length-a.length).filter((q,i,a)=>!a.slice(0,i).some(previous=>compact(previous).includes(compact(q))));
 // Leave room for actionable recommendations; additional evidence changes page count.
 const content=Math.max(1,Math.ceil(required/3),Math.ceil((required+options.length)/3),required?Math.ceil(required/3)+1:brief.mode==='training'?3:2);
 if(content+2>maximum)throw new PublicError(422,'PPT_COVERAGE_CAPACITY',`资料需要约${content+2}页，超过本次${maximum}页上限，请缩小资料范围；未删减必需内容。`);
 return content+2;
}
