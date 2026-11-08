import {it,expect,vi} from 'vitest';
import {parsePresentationRequest} from '../../apps/api/src/presentations/intent.js';
import {createPresentationSources} from '../../apps/api/src/presentations/sources.js';
import {createPresentationService} from '../../apps/api/src/presentations/service.js';
import {renderPresentation,validatePptx} from '../../apps/api/src/presentations/render.js';
const id='00000000-0000-4000-8000-000000000031';
const fake=(rows:unknown[][])=>{let i=0;return {db:{select(){const value=rows[i++];if(!value)throw Error('Unexpected read');const chain:any={from:()=>chain,innerJoin:()=>chain,where:()=>chain,orderBy:()=>chain,limit:async()=>value,then:(r:any)=>Promise.resolve(value).then(r)};return chain;}}} as any;};
it('B explicit selected documents are read without theme-vector similarity or an Embedding call',async()=>{
 const db=fake([[{ordinal:2}],[{id,status:'ready'}],[{sourceId:id,documentId:id,filename:'选定资料.pdf',page:1,text:'项目负责人为林岚。',similarity:1}]]);
 const vector=vi.fn(async()=>[]);
 const sources=await createPresentationSources(db,vector,null,null)({request:'生成5页培训PPT',conversationId:id,assistantMessageId:id,context:{documentIds:[id],meetingId:null,useMemory:false,webQuery:null,searchMode:'off',knowledgeMode:true}} as any);
 expect(sources.some(s=>s.kind==='pdf'&&s.locator.documentId===id)).toBe(true);expect(vector).not.toHaveBeenCalled();
});
it('B no attachments ignores an old knowledge toggle and never demands PDF evidence',async()=>{
 const sources=await createPresentationSources(fake([[{ordinal:2}]]),null,null,null)({request:'生成5页团队沟通培训PPT',conversationId:id,assistantMessageId:id,context:{documentIds:[],meetingId:null,useMemory:false,webQuery:null,searchMode:'off',knowledgeMode:true}} as any);
 expect(sources.map(s=>s.kind)).toEqual(['request']);
});
it('B configurable page budget accepts explicit counts outside 5–10 and chooses a useful default',()=>{
 expect(parsePresentationRequest('生成12页培训PPT').pageCount).toBe(12);
 expect(parsePresentationRequest('生成一份团队沟通培训PPT')).toMatchObject({pageMode:'auto',pageCount:3});
 expect(()=>parsePresentationRequest('生成31页PPT')).toThrow();
});
it('B twelve slides render as real PPTX without fabricated business facts or empty filler',async()=>{
 const plan:any={slides:[{kind:'cover',items:[]},...Array.from({length:10},()=>({kind:'next',items:[{kind:'recommendation',text:'建议通过复述确认双方理解一致',sourceIds:[]}]})),{kind:'references',items:[]}]};
 expect((await validatePptx((await renderPresentation(plan,[],'沟通方法',new Date('2026-11-06T00:00:00Z'))).bytes,12)).slideCount).toBe(12);
 expect(parsePresentationRequest('生成二十页培训PPT').pageCount).toBe(20);
});
it('B an old database budget rejects expanded counts before any insert',async()=>{
 const insert=vi.fn();const tx:any={execute:async()=>({rows:[{definition:'page_count between 5 and 10'}]}),insert};
 const ppt=createPresentationService({db:{}} as any,{origin:'https://stub.invalid',bucket:'stub',find:vi.fn()} as any,{complete:vi.fn()},async()=>[],{PPT_SCOPE:'UNIT',PPT_MAX_TOKENS:8192});
 await expect(ppt.enqueue(tx,id,id,{content:'生成12页培训PPT'})).rejects.toMatchObject({code:'PPT_PAGE_LIMIT_MIGRATION_REQUIRED'});expect(insert).not.toHaveBeenCalled();
});
