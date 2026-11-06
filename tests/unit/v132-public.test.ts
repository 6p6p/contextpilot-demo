import {it,expect,vi} from 'vitest';
import {answerPublicSearch} from '../../apps/api/src/search/public.js';
it('V132 natural public search uses one model call, real returned links only, no quote gate',async()=>{
 const search=vi.fn(async()=>[{id:'W1',title:'官方',url:'https://nodejs.org/en/about/previous-releases',summary:'Frozen evidence: v26 Active LTS, v24 Maintenance LTS.',queriedAt:'2026-11-06T00:00:00Z',publishedAt:null,quote:''}]);
 const complete=vi.fn(async()=>({content:'当前有两个支持阶段。https://invented.test/fake',model:'STUB'}));
 const r=await answerPublicSearch('Node.js 当前 LTS 官方来源',{search},{complete});
 expect(search).toHaveBeenCalledTimes(1);expect(complete).toHaveBeenCalledTimes(1);expect(r.content).not.toContain('invented.test');expect(r.webSources[0].url).toContain('nodejs.org');expect(r.content).toContain('2026-11-06');
});
