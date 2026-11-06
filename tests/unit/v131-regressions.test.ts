import {readFileSync} from 'node:fs';
import {it,expect,vi,afterEach} from 'vitest';
import JSZip from 'jszip';
import type {PptSource} from '../../shared/presentations.js';
import {answerWithSearch,quoteOptions} from '../../apps/api/src/search/service.js';
import {normalizeSynthesis} from '../../apps/api/src/search/format.js';
import {parsePresentationRequest} from '../../apps/api/src/presentations/intent.js';
import {planPresentation,validatePresentationContent} from '../../apps/api/src/presentations/plan.js';
import {renderPresentation,validatePptx} from '../../apps/api/src/presentations/render.js';
import {coverageSlots,requiredContent} from '../../apps/api/src/presentations/coverage.js';
import {assertCurrentPresentationTodos,createPresentationSources} from '../../apps/api/src/presentations/sources.js';
import type {WebSource} from '../../shared/search.js';
import {transcript} from '../corpus/v1/materials.js';
const fixture=(name:string)=>JSON.parse(readFileSync(`tests/fixtures/v131/${name}.json`,'utf8'));
const search=fixture('search-overflow'),a=fixture('ppt-a-failed'),b=fixture('ppt-b-failed');
const q='请查询 Node.js 当前的 Active LTS 和 Maintenance LTS 版本，优先参考 Node.js 官方发布及版本状态页面，解释区别并附官方链接和查询时间。';
afterEach(()=>vi.useRealTimers());
function searchModel(output:unknown,supported=true){return {complete:vi.fn(async(history:any[])=>{
 if(history[0].content.includes('独立证据核验器')){const data=JSON.parse(history[1].content);return {model:'STUB-REVIEW',content:JSON.stringify({claims:data.claims.map((_:unknown,index:number)=>({index,supported,reason:supported?'supported':'unsupported'})),issues:data.issues.map((_:unknown,index:number)=>({index,valid:true,reason:'insufficient'}))})};}
 return {model:'STUB-PLANNER',content:JSON.stringify(output)};
})};}
it('V131-S01 captured 7/7 structure is losslessly repaired; wrong quote-index bindings still fail',async()=>{
 vi.setSystemTime(new Date(search.clock));let call=0;
 const m=searchModel(search.output),provider={async search(){return search.searches[call++].map((s:any,i:number)=>({...s,id:`W${i+1}`,queriedAt:search.clock,quote:''}));}};
 await expect(answerWithSearch(q,provider,m)).rejects.toMatchObject({code:'SEARCH_UNSUPPORTED_SYNTHESIS'});
 expect(m.complete).toHaveBeenCalledTimes(1);
 const data=JSON.parse(m.complete.mock.calls[0][0].find((h:any)=>h.role==='user').content);
 const reviewed=normalizeSynthesis(search.output,data.untrustedSearchResults,quoteOptions);
 expect(reviewed.claims.length).toBeLessThanOrEqual(6);
 // Every original clause and its evidence survives; no slice/unsupported rewrite.
 for(const claim of search.output.claims)expect(reviewed.claims.some(c=>c.parts.some(p=>p.text===claim.text))).toBe(true);
 expect(reviewed.claims[0].proof.length).toBe(7);
});
it('V131-S02 duplicated source references collapse, different quotes on the same ID survive',async()=>{
 vi.setSystemTime(new Date(search.clock));
 const row={id:'W1',url:'https://nodejs.org/en/about/previous-releases',title:'Official',summary:'v26 Active LTS.\nv24 Maintenance LTS.',queriedAt:search.clock,publishedAt:null,quote:''};
 const m=searchModel({claims:[{text:'v26 Active LTS；v24 Maintenance LTS。',evidence:[{id:'W1',quoteIndex:1},{id:'W1',quoteIndex:1},{id:'W1',quoteIndex:2}]}],issues:[]});
 const r=await answerWithSearch(q,{async search(){return [row];}},m);
 const review=JSON.parse(m.complete.mock.calls[1][0][1].content);expect(review.claims[0].proof).toHaveLength(2);expect(r.content).toContain('v26 Active LTS');
});
it('V131-S03 normalization cannot authorize fabricated IDs or unsupported claims',async()=>{
 vi.setSystemTime(new Date(search.clock));const row={id:'W1',url:'https://nodejs.org',title:'Official',summary:'v26 Active LTS.',queriedAt:search.clock,publishedAt:null,quote:''};
 const invalid=searchModel({claims:[{text:'新状态',evidence:[{id:'forged',quoteIndex:0}]}],issues:[]});
 await expect(answerWithSearch(q,{async search(){return [row];}},invalid)).rejects.toMatchObject({code:'SEARCH_INVALID_CITATION'});expect(invalid.complete).toHaveBeenCalledTimes(1);
 for(const url of ['https://nodejs.org/invented','https://nodejs.org:invalid/']){
  const invented=searchModel({claims:[{text:`来源 ${url}`,evidence:[{id:'W1',quoteIndex:0}]}],issues:[]});
  await expect(answerWithSearch(q,{async search(){return [row];}},invented)).rejects.toMatchObject({code:'SEARCH_UNSUPPORTED_SYNTHESIS'});
 }
 const unsupported=searchModel({claims:[{text:'该项目已经延期。',evidence:[{id:'W1',quoteIndex:0}]}],issues:[]},false);
 expect((await answerWithSearch(q,{async search(){return [row];}},unsupported)).content).not.toContain('该项目已经延期');
});
it('V131-S04 seven supported statements pack losslessly and pass independent review without another model call',async()=>{
 vi.setSystemTime(new Date(search.clock));
 const row:WebSource={id:'W1',url:'https://nodejs.org/en/about/previous-releases',title:'Official frozen test evidence',summary:'v26 Active LTS. Production use Active LTS.',queriedAt:search.clock,publishedAt:null,quote:''};
 const other={...row,id:'W2',url:'https://nodejs.org/en/status',summary:'v24 Maintenance LTS. Production use Maintenance LTS.'};
 const texts=['当前v26为Active LTS。','当前v24为Maintenance LTS。','两个版本线可以并存。','生产可选Active LTS。','生产也可选Maintenance LTS。','支持状态应按版本线区分。','这不是同一版本的互斥状态。'];
 const m=searchModel({claims:texts.map(text=>({text,evidence:[{id:'W1',quoteIndexes:[0,0]},{id:'W2',quoteIndexes:[0]}]})),issues:[]});
 const r=await answerWithSearch(q,{async search(){return [row,other];}},m);
 expect(m.complete).toHaveBeenCalledTimes(2);for(const text of texts)expect(r.content).toContain(text);
 expect(r.webSources.filter(s=>s.quote)).toHaveLength(2);
});
it('V131-S05 irreducible overflow has a structure error, not a semantic-conflict diagnosis',async()=>{
 vi.setSystemTime(new Date(search.clock));const row:WebSource={id:'W1',url:'https://nodejs.org',title:'Official',summary:'LTS evidence.',queriedAt:search.clock,publishedAt:null,quote:''};
 const m=searchModel({claims:Array.from({length:7},(_,i)=>({text:String.fromCharCode(65+i).repeat(500),evidence:[{id:'W1',quoteIndex:0}]})),issues:[]});
 await expect(answerWithSearch(q,{async search(){return [row];}},m)).rejects.toMatchObject({code:'SEARCH_INVALID_STRUCTURE'});expect(m.complete).toHaveBeenCalledTimes(1);
});
const goodTraining={content:[
 {items:[{kind:'recommendation',text:'沟通时先说明结论、需要的协作和期望回应',sourceIds:[]}]},
 {items:[{kind:'recommendation',text:'倾听后复述对方重点，确认沟通双方理解一致',sourceIds:[]}]},
 {items:[{kind:'recommendation',text:'沟通结束时共同核对行动项并及时反馈',sourceIds:[]}]},
]};
it('V131-P01 explicit title, audience, language and count are distinct fields',()=>{
 expect(parsePresentationRequest(a.request)).toMatchObject({topic:'如何提高团队沟通效率',language:'中文',audience:'企业新员工',pageCount:5});
 expect(parsePresentationRequest('生成5页面向新员工的中文团队沟通培训PPT').topic).toBe('团队沟通培训');
});
it('V131-P02 captured training meta-guidance is rejected, ready-to-present 5-page content renders',async()=>{
 await expect(planPresentation({async complete(){return {model:'STUB-OLD',content:JSON.stringify(a.output)};}},a.request,5,a.sources,8192)).rejects.toMatchObject({code:'PPT_META_GUIDANCE'});
 const m={complete:vi.fn(async(_history:any[])=>({model:'STUB-NEW',content:JSON.stringify(goodTraining)}))};
 const plan=await planPresentation(m,a.request,5,a.sources,8192),brief=parsePresentationRequest(a.request);
 const input=JSON.parse(m.complete.mock.calls[0][0][2].content);expect(input.brief).toMatchObject({topic:brief.topic,audience:brief.audience,language:'中文'});
 const {bytes}=await renderPresentation(plan,a.sources,brief.topic,new Date(search.clock));expect((await validatePptx(bytes,5)).slideCount).toBe(5);
 const zip=await JSZip.loadAsync(bytes);expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('如何提高团队沟通效率');
});
it('V131-P03 captured combined output cannot publish contradictory gaps or hide a manual todo',()=>{
 expect(()=>validatePresentationContent(JSON.stringify(b.output),10,b.sources)).toThrow();
});
it('V131-P04 mixed-layout todo rendering preserves current owner/date in visible body, not only notes',async()=>{
 const {bytes}=await renderPresentation(b.plan,b.sources,'原计划混排字段回归',new Date(search.clock));const zip=await JSZip.loadAsync(bytes);
 const slide=await zip.file('ppt/slides/slide5.xml')!.async('string');expect(slide).toContain('复核供应商交付清单');expect(slide).toContain('林岚');expect(slide).toContain('2026-11-09');expect(slide).not.toContain('2026-11-08');
});
const proposal: PptSource={id:'proposal',kind:'meeting',title:'合成会议.txt',text:'提议将试点改为2026-11-27，尚未获批',classification:'fact',locator:{discussionCategory:'proposal',evidence:{quote:'提议将试点改为2026-11-27，尚未获批。',startLine:8,endLine:8}}};
function combined(){
 const sources=[...b.sources,proposal] as PptSource[],slots=coverageSlots(sources,8);
 return {sources,raw:{content:Array.from({length:8},(_,i)=>({items:slots[i]?slots[i].requiredQuotes.map(q=>({kind:'quote',sourceId:q.sourceId,quote:q.quote})):[{kind:'recommendation',text:'建议先核实供应商交付清单与接口依赖',sourceIds:[]}]}))}};
}
it('V131-P05 10-page plan covers actual edited facts and unapproved proposal in visible PPTX',async()=>{
 const {sources,raw}=combined();
 const m={async complete(){return {model:'STUB-V131',content:JSON.stringify(raw)};}};
 const plan=await planPresentation(m,b.request,10,sources,8192),{bytes,boxes}=await renderPresentation(plan,sources,'管理层汇报',new Date(search.clock));
 expect((await validatePptx(bytes,10)).slideCount).toBe(10);
 const zip=await JSZip.loadAsync(bytes);let text='';for(let i=1;i<=10;i++)text+=await zip.file(`ppt/slides/slide${i}.xml`)!.async('string');
 for(const fact of ['ORCHID-7421','Dr. Mira Qiao','AMBER-593','2026-11-20','2026-11-27','尚未获批','复核供应商交付清单','林岚','2026-11-09'])expect(text).toContain(fact);
 expect(text).not.toContain('2026-11-08');expect(text).not.toContain('现有资料不足以确认风险');expect(text).not.toContain('ContextPilot - Synthetic');
 expect(boxes.filter(b=>b.role==='body').every(b=>b.fontSize===20)).toBe(true);
});
it('V131-P06 source-kind coverage alone cannot hide a missing owner/access code or manual todo',()=>{
 for(const field of ['owner','accessCode','todo'] as const){
  const {sources,raw}=combined(),required=requiredContent(sources).find(r=>r.field===field)!;
  for(const page of raw.content)page.items=page.items.filter((i:any)=>i.quote!==required.quote) as any;
  for(const page of raw.content)if(!page.items.length)page.items=[{kind:'recommendation',text:'建议复核已提供的交付证据',sourceIds:[]}] as any;
  expect(()=>validatePresentationContent(JSON.stringify(raw),10,sources)).toThrow('遗漏必需来源字段');
 }
});
it('V131-P07 source-aware gap validation rejects contradictions but retains actual unknown fields',()=>{
 const {sources,raw}=combined();raw.content[5]={items:[{kind:'gap',text:'现有资料不足以确认风险'}] as any};
 expect(()=>validatePresentationContent(JSON.stringify(raw),10,sources)).toThrow('缺口陈述与现有证据冲突');
 const noSources={content:Array.from({length:3},()=>({items:[{kind:'gap',text:'未提供负责人或明确时间'}]}))};
 expect(validatePresentationContent(JSON.stringify(noSources),5,[]).slides).toHaveLength(5);
});
it('V131-P08 current todo version is checked, including dismissed/changed rows, without writes',async()=>{
 const source=(b.sources as PptSource[]).find(s=>s.id==='S10')!;
 const row={id:source.locator.todoId,meetingId:source.locator.meetingId,version:source.locator.todoVersion,status:source.locator.status,task:source.text,owner:source.owner,dueDate:source.dueDate,dismissedAt:null};
 const database=(r:any)=>({db:{select:()=>({from:()=>({where:async()=>[r]})})}}) as any;
 await expect(assertCurrentPresentationTodos(database(row),[source])).resolves.toBeUndefined();
 for(const change of [{version:99},{dismissedAt:new Date()},{owner:'周宁'},{dueDate:'2026-11-08'}])await expect(assertCurrentPresentationTodos(database({...row,...change}),[source])).rejects.toMatchObject({code:'PPT_TODO_SOURCE_CHANGED'});
});
it('V131-P09 source collector includes project proposals with evidence, never unrelated background',async()=>{
 const result=fixture('meeting-discussion').result;let index=0;
 const meetingId='00000000-0000-4000-8000-000000000001';
 const rows=[[{ordinal:2}],[{id:meetingId,status:'ready',currentAnalysisId:'analysis',filename:'合成会议.txt',transcript}],[{id:'analysis',version:4,result}],[],[]];
 const database={db:{select(){const values=rows[index++];const chain:any={from:()=>chain,where:()=>chain,then:(resolve:any)=>Promise.resolve(values).then(resolve)};return chain;}}} as any;
 const sources=await createPresentationSources(database,null,null,null)({request:b.request,assistantMessageId:'message',conversationId:'conversation',context:{meetingId,useMemory:false,webQuery:null,documentIds:[],searchMode:'off'}} as any);
 expect(sources.find(s=>s.locator.discussionCategory==='proposal')).toMatchObject({text:proposal.text,locator:{evidence:{startLine:8,endLine:8}}});
 expect(sources.some(s=>s.text.includes('ORCHID-FIN')||s.text.includes('立即发送邮件'))).toBe(false);
});
it('V131-P10 analysis cannot promote an unapproved proposal to a confirmed decision',()=>{
 const {sources,raw}=combined();raw.content[5]={items:[{kind:'analysis',text:'试点改期已获批准',sourceIds:['proposal']}] as any};
 expect(()=>validatePresentationContent(JSON.stringify(raw),10,sources)).toThrow('未批准提议');
});
it('V131-P11 unrelated boilerplate is rejected, direct audience advice is not meta-guidance',async()=>{
 const unrelated=structuredClone(goodTraining);unrelated.content[0].items[0].text='数据库连接使用连接池并配置超时上限';
 await expect(planPresentation({async complete(){return {model:'STUB',content:JSON.stringify(unrelated)};}},a.request,5,a.sources,8192)).rejects.toMatchObject({code:'PPT_CONTENT_IRRELEVANT'});
 const direct=structuredClone(goodTraining);direct.content[0].items[0].text='建议结合沟通上下文明确希望对方采取的行动';
 await expect(planPresentation({async complete(){return {model:'STUB',content:JSON.stringify(direct)};}},a.request,5,a.sources,8192)).resolves.toHaveProperty('slides');
});
