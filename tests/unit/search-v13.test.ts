import {it,expect,vi} from 'vitest';
import {answerWithSearch} from '../../apps/api/src/search/service.js';
const at='2026-11-06T03:26:00.537Z';
const q='请查询 Node.js 当前的 Active LTS 版本和 Maintenance LTS 版本，优先参考官方页面。';
const rows=[{id:'W1',title:'Official status',url:'https://nodejs.org/en/about/previous-releases',summary:'v26 — Active LTS. v24 — Maintenance LTS.',queriedAt:at,publishedAt:null,quote:''}];
function model(value:unknown,review:unknown){return {complete:vi.fn().mockResolvedValueOnce({model:'MOCK',content:JSON.stringify(value)}).mockResolvedValueOnce({model:'MOCK',content:JSON.stringify(review)})};}
const proof=[{id:'W1',quoteIndex:0}];
it('A coexisting version lines support natural synthesis, not a full-patch-only quote response',async()=>{
 const m=model({claims:[{text:'当前 v26 属于 Active LTS，v24 属于 Maintenance LTS，两个版本线同时有效。',evidence:proof}],issues:[]},{claims:[{index:0,supported:true,reason:'supported'}],issues:[]});
 const r=await answerWithSearch(q,{async search(){return rows;}},m);
 expect(r.content).toContain('两个版本线同时有效');expect(r.content).toContain('[W1]');expect(r.content).toContain(at);expect(r.content).not.toContain('来源存在冲突，无法确认');expect(m.complete).toHaveBeenCalledTimes(2);
});
it('A support review blocks an outdated or unsupported synthesized fact',async()=>{
 const r=await answerWithSearch(q,{async search(){return rows;}},model({claims:[{text:'v24 是当前 Active LTS。',evidence:proof}],issues:[]},{claims:[{index:0,supported:false,reason:'scope_mismatch'}],issues:[]}));
 expect(r.content).toContain('证据不足');expect(r.content).not.toContain('v24 是当前 Active LTS');
});
it('A genuine mutually exclusive claims remain explicit while unrelated supported facts can survive',async()=>{
 const other={...rows[0],id:'W2',url:'https://nodejs.org/en/status',summary:'v26 — Maintenance LTS.'};
 const r=await answerWithSearch(q,{async search(){return [...rows,other];}},model({claims:[],issues:[{kind:'conflict',text:'同一版本的当前状态证据互相排斥，无法确认。',evidence:[...proof,{id:'W2',quoteIndex:0}]}]},{claims:[],issues:[{index:0,valid:true,reason:'same_scope_conflict'}]}));
 expect(r.content).toContain('互相排斥');expect(r.webSources.filter(s=>s.quote)).toHaveLength(2);
});
it('A fabricated source or quote never reaches semantic review',async()=>{
 const m=model({claims:[{text:'v99 已发布',evidence:[{id:'fake',quoteIndex:0}]}],issues:[]},{});
 await expect(answerWithSearch(q,{async search(){return rows;}},m)).rejects.toMatchObject({code:'SEARCH_INVALID_CITATION'});expect(m.complete).toHaveBeenCalledTimes(1);
});
it('A same-page anchors are deduplicated, differing snapshots retained, generic institutions supported',async()=>{
 const source={...rows[0],url:'https://python.org/downloads/',summary:'Python 3.16.0 is the latest release.'};
 const m=model({claims:[{text:'Python 当前版本为 3.16.0。',evidence:proof}],issues:[]},{claims:[{index:0,supported:true,reason:'supported'}],issues:[]});
 const r=await answerWithSearch('Python 当前版本 官方来源',{async search(){return [source,{...source,id:'W2',url:source.url+'#install'}];}},m);
 expect(r.webSources).toHaveLength(1);expect(r.content).toContain('Python 当前版本');
});
it('A dated historical status does not erase current supported evidence; review diagnostics contain no raw page content',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{
 const old={...rows[0],id:'W2',publishedAt:'2026-07-01',summary:'v24 — Active LTS. PRIVATE_SENTINEL'};
 const m=model({claims:[{text:'v24 是当前 Active LTS。',evidence:[{id:'W2',quoteIndex:0}]},{text:'v26 为 Active LTS，v24 为 Maintenance LTS。',evidence:proof}],issues:[]},{claims:[{index:0,supported:false,reason:'outdated'},{index:1,supported:true,reason:'supported'}],issues:[]});
 const r=await answerWithSearch(q,{async search(){return [...rows,old];}},m);
 expect(r.content).not.toContain('v24 是当前 Active LTS');expect(r.content).toContain('v26 为 Active LTS');expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_SENTINEL');
 }finally{log.mockRestore();}
});
it('A failed semantic review cannot publish unchecked natural prose',async()=>{
 await expect(answerWithSearch(q,{async search(){return rows;}},model({claims:[{text:'两个受支持版本线。',evidence:proof}],issues:[]},{claims:[],issues:[]}))).rejects.toMatchObject({code:'SEARCH_INVALID_REVIEW'});
});
it('A synthesis can state the real query date without pretending it is a publication date',async()=>{
 const r=await answerWithSearch(q,{async search(){return rows;}},model({claims:[{text:'查询日期为2026-11-06，网页列有两个支持版本线。',evidence:proof}],issues:[]},{claims:[{index:0,supported:true,reason:'supported'}],issues:[]}));
 expect(r.content).toContain('查询日期为2026-11-06');expect(r.content).not.toContain('发布时间：2026-11-06');
});
it('A a review marked different_scope cannot authorize a global conflict even with valid=true',async()=>{
 const r=await answerWithSearch(q,{async search(){return rows;}},model({claims:[],issues:[{kind:'conflict',text:'两条支持版本线不同。',evidence:proof}]},{claims:[],issues:[{index:0,valid:true,reason:'different_scope'}]}));
 expect(r.content).not.toContain('来源存在冲突');expect(r.content).not.toContain('两条支持版本线不同。');
});
