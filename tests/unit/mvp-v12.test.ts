import {it,expect,vi} from 'vitest';
import {answerWithSearch} from '../../apps/api/src/search/service.js';
import type {WebSource} from '../../shared/search.js';
import {PresentationPanel} from '../../apps/web/src/PresentationPanel.js';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildApp} from '../../apps/api/src/app.js';
import {parseEnv} from '../../apps/api/src/config/env.js';
import {PublicError} from '../../apps/api/src/errors.js';
import {createPresentationAuth} from '../../apps/api/src/presentations/auth.js';
import {createPresentationSources} from '../../apps/api/src/presentations/sources.js';
import {planPresentation} from '../../apps/api/src/presentations/plan.js';
import {renderPresentation,validatePptx} from '../../apps/api/src/presentations/render.js';
import {createPresentationService} from '../../apps/api/src/presentations/service.js';
const id='00000000-0000-4000-8000-000000000071';
const q='请联网查询 Node.js 当前的 LTS 版本，并给出官方来源链接和查询时间。';
const at='2026-11-06T08:00:00Z';
const source=(id:string,summary:string,url='https://nodejs.org/en/about/previous-releases',publishedAt:string|null=null):WebSource=>({id,summary,url,publishedAt,queriedAt:at,title:'Frozen official evidence — MOCK',quote:''});
const model=(value:unknown)=>({complete:vi.fn(async()=>({content:JSON.stringify(value),model:'MOCK'}))});
it('FIX01 current official status resolves dated historical LTS; Active and Maintenance coexist',async()=>{
 const rows=[source('W1','v26 — Active LTS\nv24 — Maintenance LTS'),source('W2','Node.js v26.13.0 has been released.','https://nodejs.org/en/blog/release/v26.13.0','2026-11-05'),source('W3','The latest Active LTS is Node.js v24.0.0.','https://nodejs.org/en/blog/release/old','2026-11-03')];
 const r=await answerWithSearch(q,{async search(){return rows;}},model({status:'conflicting',citations:[{id:'W3',quoteIndex:0}],release:{version:'26.13.0',status:'Active LTS',evidence:[{id:'W1',quoteIndex:0},{id:'W2',quoteIndex:0}]}}));
 expect(r.content.startsWith('基于官方证据归纳')).toBe(true);expect(r.content).toContain('v26.13.0');expect(r.content).not.toContain('来源存在冲突，无法确认');expect(r.webSources.find(s=>s.id==='W1')?.quote).toContain('Maintenance LTS');
});
it('FIX01 status-before-version table supports synthesis without manufacturing a latest patch',async()=>{
 const rows=[source('W1','Active LTS | v26\nMaintenance LTS | v24'),source('W2','Node.js v26.13.0 has been released.','https://nodejs.org/en/blog/release/v26.13.0','2026-11-05')];
 const r=await answerWithSearch(q,{async search(){return rows;}},model({status:'supported',citations:[],release:{version:'26.13.0',status:'Active LTS',evidence:[{id:'W1',quoteIndex:0},{id:'W2',quoteIndex:0}]}}));
 expect(r.content).toContain('基于官方证据归纳');expect(r.content).toContain('最新补丁版本仍需');
});
it('FIX01 unresolved equally current latest claims stay conflicting',async()=>{
 const rows=[source('W1','The latest Active LTS is Node.js v26.13.0.'),source('W2','The latest Active LTS is Node.js v26.14.0.')];
 const r=await answerWithSearch(q,{async search(){return rows;}},model({status:'supported',conclusion:{id:'W1',quoteIndex:0},citations:rows.map(s=>({id:s.id,quoteIndex:0}))}));
 expect(r.content.startsWith('来源存在冲突')).toBe(true);expect(r.webSources.filter(s=>s.quote)).toHaveLength(2);
});
it('FIX02 no second PPT password form even outside the authenticated React provider',()=>{
 const html=renderToStaticMarkup(createElement(PresentationPanel,{refresh:0,visible:true}));
 expect(html).not.toContain('PPT 访问口令');expect(html).not.toContain('解锁 PPT');
});
it('FIX02 existing local PPT secret provides ONE Demo login; download still rejects unauthenticated/legacy-only cookies',async()=>{
 const key='synthetic-v12-secret-for-tests-only-123456';
 const app=buildApp(parseEnv({NODE_ENV:'test',PPT_ACCESS_KEY:key}));
 try{
  expect((await app.inject('/api/demo-session')).json()).toEqual({required:true,authenticated:false});
  expect((await app.inject(`/api/presentations/${id}/download`)).statusCode).toBe(401);
  const login=await app.inject({method:'POST',url:'/api/demo-session',payload:{accessKey:key}});
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  expect((await app.inject({url:'/api/presentations',headers:{cookie}})).json().error.code).toBe('DATABASE_NOT_CONFIGURED');
  expect((await app.inject({url:`/api/presentations/${id}/download`,headers:{cookie}})).json().error.code).toBe('DATABASE_NOT_CONFIGURED');
  await app.inject({method:'DELETE',url:'/api/demo-session',headers:{cookie}});
  expect((await app.inject('/api/presentations')).statusCode).toBe(401);
 }finally{await app.close();}
});
function fakeDatabase(responses:unknown[][]){let i=0;return {db:{select(){const value=responses[i++];if(!value)throw Error('Unexpected database read');const chain:any={from:()=>chain,where:()=>chain,orderBy:()=>chain,limit:async()=>value,then:(resolve:any)=>Promise.resolve(value).then(resolve)};return chain;}}} as any;}
it('FIX02 A plain 5-page topic reads no historical sources and produces a valid PPTX with the planner STUB',async()=>{
 const collect=createPresentationSources(fakeDatabase([[{ordinal:3}]]),vi.fn(),null,null);
 const sources=await collect({request:'生成5页团队沟通培训PPT',conversationId:id,assistantMessageId:id,context:{meetingId:null,useMemory:false,webQuery:null,documentIds:[],useChat:false,knowledgeMode:false,searchMode:'off'}} as any);
 expect(sources.map(s=>s.kind)).toEqual(['request']);
 const plan=await planPresentation(model({content:['建议明确沟通目标','建议复述对方的核心诉求','建议反馈具体行为'].map(text=>({items:[{kind:'recommendation',text,sourceIds:[]}]}))}),'生成5页团队沟通培训PPT',5,sources,8192);
 const rendered=await renderPresentation(plan,sources,'团队沟通培训',new Date(at));
 expect((await validatePptx(rendered.bytes,5)).slideCount).toBe(5);
});
it('FIX02 B selected PDF/meeting/current saved todo/memory produce 10 editable slides without implicit global sources',async()=>{
 const evidence={quote:'负责人林岚复核接口',startLine:4,endLine:4};
 const db=fakeDatabase([[{ordinal:3}],[{id,status:'ready',filename:'合成会议',transcript:'负责人林岚复核接口',currentAnalysisId:id}],[{id,version:2,result:{topic:null,meetingDate:null,location:null,participants:[],topics:[],decisions:[],risks:[],actions:[]}}],[{id,description:'接口待验证',impact:'影响试点',level:'high'}],[evidence],[{id,task:'复核接口',owner:'林岚',dueDate:'2026-11-10',version:4,analysisId:id,userEdited:true,status:'open',origin:'meeting_action',evidence}]]);
 const retrieve=vi.fn(async(_question?:string,_ids?:string[])=>[{sourceId:id,documentId:id,filename:'选中PDF',page:2,text:'项目负责人是Dr. Mira Qiao。',similarity:1}]);
 const memory={retrieve:vi.fn(async()=>[{id,content:'林岚在南京协调试点。',sources:[]}])};
 const sources=await createPresentationSources(db,retrieve,memory as any,null,ids=>retrieve("选定PDF全文",ids))({request:'根据PDF和会议生成10页管理层汇报PPT',conversationId:id,assistantMessageId:id,context:{meetingId:id,useMemory:true,webQuery:null,documentIds:[id],useChat:false,knowledgeMode:true,searchMode:'off'}} as any);
 expect(retrieve).toHaveBeenCalledWith(expect.any(String),[id]);expect(sources.some(s=>s.kind==='chat')).toBe(false);
 expect(sources.find(s=>s.kind==='todo')).toMatchObject({owner:'林岚',dueDate:'2026-11-10',locator:{todoVersion:4,userEdited:true}});
 const content=Array.from({length:8},(_,i)=>{const s=sources[1+i%(sources.length-1)];return {items:[{kind:'quote',sourceId:s.id,quote:s.text.split('\n')[0]}]};});
 const plan=await planPresentation(model({content}),'根据资料生成10页管理层汇报PPT',10,sources,8192);
 expect((await validatePptx((await renderPresentation(plan,sources,'综合管理汇报',new Date(at))).bytes,10)).slideCount).toBe(10);
});
it('FIX01 one bounded supplemental search deduplicates URLs and assigns noncolliding source IDs',async()=>{
 const rows=[source('W1','v26 — Active LTS'),source('W2','Node.js v26.13.0 released.','https://nodejs.org/en/blog/release/v26.13.0','2026-11-05')];
 const search=vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(rows);
 const r=await answerWithSearch(q,{search},model({status:'supported',citations:[],release:{version:'26.13.0',status:'Active LTS',evidence:[{id:'W1',quoteIndex:0},{id:'W2',quoteIndex:0}]}}));
 expect(search).toHaveBeenCalledTimes(2);expect(r.content).toContain('基于官方证据归纳');expect(new Set(r.webSources.map(s=>s.id)).size).toBe(r.webSources.length);
});
it('FIX01 localized official catalogues without patch numbers trigger bounded supplementation instead of guessing',async()=>{
 // Shape reproduced from saved public 2026-11-06 official snippets, NOT a live version claim.
 const rows=[source('W1','| v26 | Current |\n| v24 | Krypton | LTS |','https://nodejs.org/zh-cn/about/previous-releases'),source('W2','| v26 | Lithium | LTS |\n| v24 | Krypton | LTS |','https://nodejs.org/zh-cn/about/releases')];
 const search=vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([source('W1','Node.js v26.13.0 is the latest Active LTS.','https://nodejs.org/en/blog/release/v26.13.0','2026-11-05')]);
 const r=await answerWithSearch(q,{search},model({status:'supported',citations:[],release:{version:'26.13.0',status:'Active LTS',evidence:[{id:'W3',quoteIndex:0}]}}));
 expect(search).toHaveBeenCalledTimes(2);expect(r.content).toContain('基于官方证据归纳');expect(r.webSources.find(s=>s.id==='W3')?.url).toContain('v26.13.0');
 const insufficient=await answerWithSearch(q,{async search(){return rows;}},model({status:'insufficient',citations:[{id:'W1',quoteIndex:0}]}));
 expect(insufficient.content).toContain('证据不足');expect(insufficient.content).not.toContain('v26.13.0');
});
it('FIX01 long status tables expose complete row quote options and associate status through table columns',async()=>{
 const row='| v26 | Lithium | 2026-04-01 | Active LTS |';
 const summary=row+'\n'+Array.from({length:32},(_,i)=>`| 历史记录${i} | 已结束支持 | 仅供历史对照 |`).join('\n');
 const m={complete:vi.fn(async(history:any[])=>{const input=JSON.parse(history.find(h=>h.role==='user').content);const s=input.untrustedSearchResults.find((s:any)=>s.id==='W1');const index=s.quoteOptions.indexOf(row);expect(index).toBeGreaterThanOrEqual(0);return {model:'MOCK',content:JSON.stringify({status:'supported',citations:[],release:{version:'26.13.0',status:'Active LTS',evidence:[{id:'W1',quoteIndex:index},{id:'W2',quoteIndex:0}]}})};})};
 const search=vi.fn(async()=>[source('W1',summary),source('W2','Node.js v26.13.0 has been released.','https://nodejs.org/en/blog/release/v26.13.0','2026-11-05')]);
 const result=await answerWithSearch(q,{search},m);expect(result.content).toContain('基于官方证据归纳');expect(search).toHaveBeenCalledTimes(1);
});
it('FIX01 supplemental quota failure is explicit, bounded and cannot manufacture a conclusion',async()=>{
 const search=vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new PublicError(502,'SEARCH_QUOTA_EXCEEDED','quota'));
 const m=model({status:'supported',citations:[]});const result=await answerWithSearch(q,{search},m);
 expect(search).toHaveBeenCalledTimes(2);expect(m.complete).not.toHaveBeenCalled();expect(result.content).toContain('SEARCH_QUOTA_EXCEEDED');expect(result.webSources).toEqual([]);
});
it('FIX02 missing authentication configuration directs users to the ONE Demo login setup',()=>{
 expect(()=>createPresentationAuth(parseEnv({})).require({headers:{}})).toThrow('DEMO_ACCESS_KEY');
});
it('FIX02 queued job persists its explicit source scope independently of ordinary chat switches',async()=>{
 let saved:any;const tx:any={insert:()=>({values:async(value:any)=>{saved=value;}})};
 const storage:any={origin:'https://stub.invalid',bucket:'LOCAL_STUB',find:vi.fn()};
 const service=createPresentationService({db:{}} as any,storage,model({}),async()=>[],{PPT_SCOPE:'UNIT-MOCK',PPT_MAX_TOKENS:8192});
 await service.enqueue(tx,id,id,{content:'生成5页团队沟通培训PPT',knowledgeMode:true,searchMode:'required'});
 expect(saved.context).toMatchObject({documentIds:[],meetingId:null,useMemory:false,useChat:false,knowledgeMode:false,searchMode:'off'});
 await service.enqueue(tx,id,id,{content:'生成10页管理层汇报PPT',presentationContext:{documentIds:[id],meetingId:id,useMemory:true,useChat:true,webQuery:null}});
 expect(saved.context).toMatchObject({documentIds:[id],meetingId:id,useMemory:true,useChat:true,knowledgeMode:true,searchMode:'off'});
});
