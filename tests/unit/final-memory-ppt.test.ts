import { expect, it, vi } from 'vitest';
import { memoryProjects, relatedMemory } from '../../apps/api/src/memory/recall.js';
import { answerWithMemory } from '../../apps/api/src/memory/service.js';
import { coverageSlots, requiredContent, contentPageCount } from '../../apps/api/src/presentations/coverage.js';
import { parsePresentationRequest } from '../../apps/api/src/presentations/intent.js';
import { renderPresentation } from '../../apps/api/src/presentations/render.js';
import { sources } from '../corpus/v1/materials.js';
import type { MemoryCitation } from '../../shared/memory.js';
import type { PptSource } from '../../shared/presentations.js';
import JSZip from 'jszip';
const id = '00000000-0000-4000-8000-000000000001';
const text = '项目LYRA-12。负责人是陈晨。陈晨于2027-02-03在武汉负责试点；另一项目LYRA-FIN的陈晨负责财务，地点深圳。';
function memory(content:string,quote:string):MemoryCitation { return { id,kind:'person',content,sources:[{sourceType:'chat',sourceId:id,parentId:id,observedAt:'2026-11-08',evidence:{startLine:1,endLine:1,quote}}] }; }
it('associates stored fragments with preceding project context and honors exclusions symmetrically',()=>{
 const originals=new Map([[id,text]]);
 const question='LYRA-12负责人是谁？何时在哪里负责试点？不要混入LYRA-FIN';
 expect([...memoryProjects(question).positive]).toEqual(['lyra-12']);
 expect(relatedMemory(question,memory('陈晨','负责人是陈晨'),originals)).not.toBeNull();
 expect(relatedMemory(question,memory('武汉','陈晨于2027-02-03在武汉负责试点'),originals)).not.toBeNull();
 expect(relatedMemory(question,memory('深圳','另一项目LYRA-FIN的陈晨负责财务，地点深圳'),originals)).toBeNull();
 expect(relatedMemory('LYRA-FIN负责人所在地，不要混入LYRA-12',memory('深圳','另一项目LYRA-FIN的陈晨负责财务，地点深圳'),originals)).not.toBeNull();
 expect(relatedMemory('LYRA-FIN负责人所在地',memory('武汉','陈晨于2027-02-03在武汉负责试点'),originals)).toBeNull();
});
it('uses only stored quote bytes, not additional source facts, and enforces meeting-only provenance',()=>{
 const original=text+'\n秘密预算999';
 const candidate=memory('陈晨','负责人是陈晨');
 const result=relatedMemory('LYRA-12负责人',candidate,new Map([[id,original]]))!;
 expect(result.sources[0].evidence.quote).toBe('负责人是陈晨');
 expect(JSON.stringify(result)).not.toContain('999');
 expect(relatedMemory('根据已保存会议记忆，LYRA-12负责人',candidate,new Map([[id,original]]))).toBeNull();
});
it('does not interpret a room code between project heading and decision as a new project',()=>{
 const original='项目LYRA-12\n地点：Room Cedar-17\n决定保留2027-02-03试点目标';
 const candidate=memory('决定保留2027-02-03试点目标','决定保留2027-02-03试点目标');
 candidate.sources[0].evidence={startLine:3,endLine:3,quote:candidate.content};
 expect(relatedMemory('LYRA-12试点目标',candidate,new Map([[id,original]]))).not.toBeNull();
});
it('answers with stored relational evidence and never falls back to general knowledge for memory-only gaps',async()=>{
 const m=memory('陈晨','陈晨于2027-02-03在武汉负责试点');
 const model={complete:vi.fn().mockResolvedValue({model:'STUB',content:JSON.stringify({memoryIds:[id]})})};
 const answer=await answerWithMemory('仅根据长期记忆，何时在哪里负责试点',[],model,[m]);
 expect(answer.content).toContain('2027-02-03在武汉');
 const unknown=await answerWithMemory('仅根据长期记忆，批准的生产上线日期',[],model,[]);
 expect(unknown.content).toContain('无法确认'); expect(model.complete).toHaveBeenCalledTimes(1);
});
const proposal:PptSource={id:'proposal',kind:'meeting',title:'会议',classification:'fact',text:'提议延期至2026-11-27，尚未获批。',locator:{discussionCategory:'proposal'}};
const selected=[...sources.filter(s=>!['web','memory','request'].includes(s.kind)),proposal].map(s=>s.kind==='todo'?{...s,owner:'林岚',dueDate:'2026-11-09',locator:{...s.locator,userEdited:true,status:'in_progress'}}:s);
it('auto count follows content, explicit counts remain fixed, and capacity conflicts are explained',()=>{
 expect(parsePresentationRequest('根据PDF生成管理汇报PPT')).toMatchObject({pageMode:'auto'});
 expect(parsePresentationRequest('自动决定合适页数，生成管理汇报PPT')).toMatchObject({pageMode:'auto'});
 expect(parsePresentationRequest('生成5页管理汇报PPT')).toMatchObject({pageMode:'fixed',pageCount:5});
 expect(contentPageCount('生成5页管理汇报PPT',selected)).toBe(5);
 expect(contentPageCount('生成管理汇报PPT',selected)).toBeGreaterThan(contentPageCount('生成普通主题PPT',[]));
 expect(()=>contentPageCount('生成3页管理汇报PPT',selected)).toThrow('请改用自动页数');
});
it('does not count footer filenames as owners or duplicate the same owner across sources',()=>{
 const aliases:PptSource[]=[{id:'a',kind:'pdf',title:'文件',classification:'fact',text:'The owner of project LYRA-12 is Dr. Chen.',locator:{}},{id:'b',kind:'pdf',title:'文件',classification:'fact',text:'Project owner: Dr. Chen. Delivery coordinator: Kim.',locator:{}},{id:'c',kind:'pdf',title:'文件',classification:'fact',text:'rag-owner.pdf | Page 2 | Synthetic test data only',locator:{}}];
 expect(requiredContent(aliases)).toHaveLength(1);
});
it('renders a fixed five-page mixed plan with current owner/date/status in visible body',async()=>{
 const slots=coverageSlots(selected,3);
 const plan={slides:[{kind:'cover' as const,items:[]},...slots.map(s=>({kind:'summary' as const,items:s.requiredQuotes.map(q=>({kind:'quote' as const,sourceId:q.sourceId,quote:q.quote}))})),{kind:'references' as const,items:[]}]};
 while(plan.slides.length<5)plan.slides.splice(-1,0,{kind:'summary',items:[{kind:'recommendation',text:'建议核实依赖后推进协作',sourceIds:[]}]} as never);
 const {bytes}=await renderPresentation(plan,selected,'管理汇报',new Date('2026-11-08'));
 const zip=await JSZip.loadAsync(bytes);let body='';for(let i=1;i<=5;i++)body+=await zip.file(`ppt/slides/slide${i}.xml`)!.async('string');
 for(const value of ['林岚','2026-11-09','进行中','AMBER-593','Dr. Mira Qiao','2026-11-27'])expect(body).toContain(value);
});
