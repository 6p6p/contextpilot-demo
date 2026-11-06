import {it,expect,vi} from 'vitest';
import {answerWithSearch,createSearchProvider,publicQuery} from '../../apps/api/src/search/service.js';
import {searchIntent,currentConclusion} from '../../apps/api/src/search/evidence.js';
import {parseEnv} from '../../apps/api/src/config/env.js';
import type {WebSource} from '../../shared/search.js';
const at='2026-11-05T08:00:00.000Z';
const old:WebSource={id:'W1',title:'July article',url:'https://nodejs.org/en/blog/old',summary:'Node.js v24 is the current Active LTS.',publishedAt:'2026-07-01',queriedAt:at,quote:''};
const fresh:WebSource={id:'W2',title:'Official current status',url:'https://nodejs.org/en/about/previous-releases',summary:'The latest Active LTS is Node.js v26.13.0. Node.js v24 is Maintenance LTS.',publishedAt:'2026-11-04',queriedAt:at,quote:''};
const q='请联网查询 Node.js 当前的 LTS 版本，并给出官方来源链接和查询时间。';
const model=(value:unknown)=>({complete:vi.fn(async()=>({model:'MOCK',content:JSON.stringify(value)}))});
it('prefers recent official status, gives verified conclusion before sources and preserves timestamps',async()=>{
 const m=model({status:'supported',conclusion:{id:'W2',quote:'The latest Active LTS is Node.js v26.13.0.'},citations:[{id:'W1',quote:old.summary},{id:'W2',quote:fresh.summary}]});
 const search=vi.fn(async()=>[old,fresh]);const r=await answerWithSearch(q,{search},m);
 expect(search).toHaveBeenCalledTimes(1);expect(search.mock.calls[0]).toEqual([publicQuery(q),{domains:['nodejs.org'],asOf:expect.any(String)}]);
 expect(r.content.startsWith('结论（来源明确记载）：The latest Active LTS is Node.js v26.13.0.')).toBe(true);
 expect(r.content).toContain('Maintenance LTS');expect(r.content).toContain(at);expect(r.content).toContain('2026-07-01');expect(r.content).toContain(fresh.url);
 const input=JSON.parse((m.complete.mock.calls[0] as any)[0].find((m:any)=>m.role==='user').content);expect(input.untrustedSearchResults[0].id).toBe('W2');
});
it('does not turn a literal but stale or undated archive quote into a current conclusion',async()=>{
 for(const source of [old,{...old,publishedAt:null}]){
 const r=await answerWithSearch(q,{async search(){return [source];}},model({status:'supported',conclusion:{id:'W1',quote:old.summary},citations:[{id:'W1',quote:old.summary}]}));
 expect(r.content.startsWith('搜索结果证据不足')).toBe(true);expect(r.content).not.toContain('结论（来源明确记载）');
 if(source.publishedAt===null){expect(r.webSources[0].publishedAt).toBeNull();expect(r.content).toContain('发布时间：未提供');}
 }
});
it('a newer dated official current-status result prevents selecting an earlier current claim',async()=>{
 const earlier={...old,publishedAt:'2026-11-03'};
 const r=await answerWithSearch(q,{async search(){return [earlier,fresh];}},model({status:'supported',conclusion:{id:'W1',quote:earlier.summary},citations:[{id:'W1',quote:earlier.summary}]}));
 expect(r.content.startsWith('搜索结果证据不足')).toBe(true);
});
it('conflicting current official claims produce no confident conclusion and keep both quotes',async()=>{
 const other={...fresh,id:'W3',summary:'The latest Active LTS is Node.js v24.0.0.'};
 const r=await answerWithSearch(q,{async search(){return [fresh,other];}},model({status:'supported',conclusion:{id:'W2',quote:fresh.summary},citations:[{id:'W2',quote:fresh.summary},{id:'W3',quote:other.summary}]}));
 expect(r.content.startsWith('来源存在冲突，无法确认')).toBe(true);expect(r.content).toContain('v26.13.0');expect(r.content).toContain('v24.0.0');
});
it('authority selection is task-scoped; spoofed domains and unknown institutions cannot support official claims',async()=>{
 expect(searchIntent('Python 当前版本 官方来源').domains).toEqual(['python.org']);
 expect(searchIntent('普通新闻').domains).toEqual([]);expect(searchIntent('某机构最新版本 官方来源').domains).toEqual([]);
 for(const url of ['https://nodejs.org.evil.invalid/','https://evil.invalid/nodejs.org'])expect(currentConclusion(q,{...fresh,url},fresh.summary)).toBe(false);
 const untrusted={...fresh,url:'https://news.invalid/latest'};
 const r=await answerWithSearch(q,{async search(){return [untrusted];}},model({status:'supported',conclusion:{id:'W2',quote:fresh.summary},citations:[{id:'W2',quote:fresh.summary}]}));
 expect(r.content).not.toContain('v26.13.0');expect(r.webSources[0].quote).toBe('');
});
it('rejects fabricated conclusion IDs or non-verbatim conclusion text',async()=>{
 for(const conclusion of [{id:'fake',quote:fresh.summary},{id:'W2',quote:'Node.js v99 is latest.'}])await expect(answerWithSearch(q,{async search(){return [fresh];}},model({status:'supported',conclusion,citations:[]}))).rejects.toMatchObject({code:'SEARCH_INVALID_CITATION'});
});
it('chat search adds query date/domain hints in one Basic request, direct shared-provider callers remain unchanged',async()=>{
 const transport=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(JSON.stringify({results:[{title:fresh.title,url:fresh.url,content:fresh.summary,published_date:fresh.publishedAt}]})));
 const provider=createSearchProvider(parseEnv({TAVILY_API_KEY:'MOCK-placeholder'}),transport)!;
 await answerWithSearch(q,provider,model({status:'insufficient',conclusion:null,citations:[]}));
 expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toMatchObject({include_domains:['nodejs.org'],search_depth:'basic',query:expect.stringMatching(/as of \d{4}-\d{2}-\d{2}$/)});
 await provider.search('Node.js latest LTS official');expect(JSON.parse(String(transport.mock.calls[1][1]?.body)).query).toBe('Node.js latest LTS official');
});
