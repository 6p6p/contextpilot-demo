import {z} from 'zod';
import {webSourceSchema,type WebSource} from '../../../../shared/search.js';
import {PublicError} from '../errors.js';

export const synthesisLimits={claims:6,issues:4,sourcesPerStatement:4,quotesPerSource:8,inputClaims:12,inputIssues:8,totalInputReferences:64} as const;
const id=z.string().min(1).max(64),quote=z.string().min(1).max(800),index=z.number().int().nonnegative();
const citation=z.union([
 z.object({id,quote}).strict(),z.object({id,quoteIndex:index}).strict(),
 z.object({id,quoteIndexes:z.array(index).min(1).max(synthesisLimits.quotesPerSource)}).strict(),
]);
const statement=z.object({text:z.string().trim().min(1).max(600),evidence:z.array(citation).min(1).max(32)}).strict();
const inputSchema=z.object({claims:z.array(statement).max(synthesisLimits.inputClaims),issues:z.array(statement.extend({kind:z.enum(['conflict','insufficient'])})).max(synthesisLimits.inputIssues)}).strict();
// Preferred wire shape groups quotations by source, instead of repeating its ID.
export const synthesisOutputSchema=z.object({
 claims:z.array(z.object({text:z.string().min(1).max(600),evidence:z.array(z.object({id,quoteIndexes:z.array(index).min(1).max(synthesisLimits.quotesPerSource)}).strict()).min(1).max(synthesisLimits.sourcesPerStatement)}).strict()).max(synthesisLimits.claims),
 issues:z.array(z.object({kind:z.enum(['conflict','insufficient']),text:z.string().min(1).max(600),evidence:z.array(z.object({id,quoteIndexes:z.array(index).min(1).max(synthesisLimits.quotesPerSource)}).strict()).min(1).max(synthesisLimits.sourcesPerStatement)}).strict()).max(synthesisLimits.issues),
}).strict();
export const synthesisContract=`最多6个claims、4个issues；每项text最多600字符，最多4个不同来源ID，每来源最多8条完整引文选项，全回答最多64条引文引用。evidence按ID合并，使用{id,quoteIndexes:[0,1]}，不得重复ID或相同引文。quoteIndex复制候选原文显式提供的标号，不自行计数。每个结论的每个事实必须被本项实际引用支持；不足仅标记相应限制。text不写URL，来源URL和查询时间由服务器附加。不要加入未引用的数字、事实或日期。JSON Schema：${JSON.stringify(z.toJSONSchema(synthesisOutputSchema))}`;
type Part={text:string;proof:WebSource[]};
export type SearchStatement={text:string;proof:WebSource[];parts:Part[];kind?:'conflict'|'insufficient'};
const unique=(proof:WebSource[])=>proof.filter((p,i,a)=>a.findIndex(s=>s.id===p.id&&s.quote===p.quote)===i);
const fits=(s:SearchStatement)=>s.text.length<=600&&new Set(s.proof.map(p=>p.id)).size<=synthesisLimits.sourcesPerStatement&&s.proof.every(p=>s.proof.filter(q=>p.id===q.id).length<=synthesisLimits.quotesPerSource);
function structure():never{console.warn(JSON.stringify({event:'search_output_rejected',stage:'structure',reason:'unrepairable_shape'}));throw new PublicError(502,'SEARCH_INVALID_STRUCTURE','搜索回答格式超出约定且无法无损规范化，未发布。');}
const canonical=(url:string)=>{try{const u=new URL(url);u.hash='';return u.href;}catch{return null;}};
export function normalizeSynthesis(value:unknown,sources:WebSource[],options:(s:string)=>string[]){
 if(JSON.stringify(value)?.length>60000)structure();
 const parsed=inputSchema.safeParse(value);if(!parsed.success)structure();
 if(sources.some((s,i)=>!webSourceSchema.safeParse(s).success||sources.findIndex(p=>p.id===s.id)!==i))throw new PublicError(502,'SEARCH_INVALID_CITATION','候选来源ID重复或元数据无效。');
 let references=0;
 const normalize=(s:z.infer<typeof statement>&{kind?:'conflict'|'insufficient'}):SearchStatement=>{
  const proof=unique(s.evidence.flatMap(c=>{
   const source=sources.find(p=>p.id===c.id);if(!source)throw new PublicError(502,'SEARCH_INVALID_CITATION','引用了不存在的来源。');
   const quotes='quote' in c?[c.quote]:('quoteIndex' in c?[c.quoteIndex]:c.quoteIndexes).map(i=>options(source.summary)[i]);
   references+=quotes.length;if(references>synthesisLimits.totalInputReferences)structure();
   return quotes.map(quote=>{if(!quote||!source.summary.includes(quote))throw new PublicError(502,'SEARCH_INVALID_CITATION','逐字引文未通过原文核对。');return {...source,quote};});
  }));
  const out={text:s.text,proof,parts:[{text:s.text,proof}],...(s.kind?{kind:s.kind}:{})};if(!fits(out))structure();return out;
 };
 // One bounded deterministic format repair. Dedup exact repeats, then pack whole
 // adjacent statements when necessary. All original clauses and proof bindings survive.
 // No slicing, new prose, re-search or model repair call.
 const pack=(rows:SearchStatement[],max:number)=>{
  const out=rows.filter((s,i,a)=>a.findIndex(p=>p.kind===s.kind&&p.text===s.text&&JSON.stringify(p.proof)===JSON.stringify(s.proof))===i);
  while(out.length>max){let merged=false;for(let i=out.length-2;i>=0;i--){const a=out[i],b=out[i+1];if(a.kind!==b.kind)continue;const s={...a,text:a.text+'\n'+b.text,proof:unique([...a.proof,...b.proof]),parts:[...a.parts,...b.parts]};if(fits(s)){out.splice(i,2,s);merged=true;break;}}if(!merged)structure();}return out;
 };
 const claims=pack(parsed.data.claims.map(normalize),synthesisLimits.claims),issues=pack(parsed.data.issues.map(normalize),synthesisLimits.issues);
 console.info(JSON.stringify({event:'search_output_normalized',stage:'structure',inputClaims:parsed.data.claims.length,claims:claims.length,inputIssues:parsed.data.issues.length,issues:issues.length,references,repair:'deterministic_lossless',modelRepairCalls:0}));
 return {claims,issues};
}

export function verifySynthesisReferences(statements:SearchStatement[]){
 for(const statement of statements)for(const part of statement.parts){
  const text=part.text.replace(/https?:\/\/[^\s（）()，。；;]+/gi,url=>{
   const target=canonical(url);if(!target||!part.proof.some(p=>canonical(p.url)===target))throw new PublicError(502,'SEARCH_UNSUPPORTED_SYNTHESIS','归纳包含未引用的URL。');return '';
  });
  if(Array.from(text.matchAll(/\d+(?:[.\/-]\d+)*/g),m=>m[0]).some(n=>!part.proof.some(p=>p.quote.includes(n)||p.queriedAt.includes(n)||p.publishedAt?.includes(n)))){
   console.warn(JSON.stringify({event:'search_output_rejected',stage:'evidence_binding',reason:'unsupported_number_or_date'}));
   throw new PublicError(502,'SEARCH_UNSUPPORTED_SYNTHESIS','归纳新增了指定引文未支持的数字或日期，未发布。');
  }
 }
}
