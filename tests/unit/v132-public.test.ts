import {it,expect,vi} from 'vitest';
import {answerPublicSearch} from '../../apps/api/src/search/public.js';
import {createSearchProvider} from '../../apps/api/src/search/service.js';
import {parseEnv} from '../../apps/api/src/config/env.js';
it('V132 public search requests bounded page text; timestamps and URLs stay provider-owned',async()=>{
 const transport=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({results:[{title:'Official',url:'https://example.org/status',content:'old snippet',raw_content:'Current official page. '+ 'x'.repeat(7000),published_date:null}]})));
 const provider=createSearchProvider(parseEnv({TAVILY_API_KEY:'synthetic-test-only-key'}),transport)!;
 const rows=await provider.search('当前版本',{domains:[],includeContent:true});
 expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toMatchObject({search_depth:'basic',include_raw_content:'text',include_answer:false});
 expect(rows[0].summary).toHaveLength(6000);expect(rows[0].summary).toContain('Current official page');expect(rows[0].publishedAt).toBeNull();expect(rows[0].url).toBe('https://example.org/status');
});
it('V132 natural public search uses one model call, real returned links only, no quote gate',async()=>{
 const search=vi.fn(async()=>[{id:'W1',title:'官方',url:'https://nodejs.org/en/about/previous-releases',summary:'Frozen evidence: v26 Active LTS, v24 Maintenance LTS.',queriedAt:'2026-11-06T00:00:00Z',publishedAt:null,quote:''}]);
 const complete=vi.fn(async()=>({content:'当前有两个支持阶段。https://invented.test/fake',model:'STUB'}));
 const r=await answerPublicSearch('Node.js 当前 LTS 官方来源',{search},{complete});
 expect(search).toHaveBeenCalledTimes(1);expect(complete).toHaveBeenCalledTimes(1);expect(r.content).not.toContain('invented.test');expect(r.webSources[0].url).toContain('nodejs.org');expect(r.content).toContain('2026-11-06');
});
