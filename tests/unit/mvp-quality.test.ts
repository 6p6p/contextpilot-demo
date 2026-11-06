import {it,expect} from 'vitest';
import {parseAnalysis} from '../../apps/api/src/meetings/analysis.js';
import {analysis,transcript,evidence} from '../corpus/v1/materials.js';
import {projectRelevant,useCurrentContext} from '../../apps/api/src/evidence/policy.js';
import {answerWithMemory} from '../../apps/api/src/memory/service.js';
import {answerWithSearch} from '../../apps/api/src/search/service.js';
import {conflictingLts} from '../../apps/api/src/search/evidence.js';
import {latestDraftBody} from '../../apps/api/src/meetings/draft-state.js';
import {extractMeeting} from '../../apps/api/src/memory/extraction.js';
it('pending meeting questions do not become asserted long-term events',()=>{
 const text='是否调整试点目标？';
 expect(extractMeeting({...analysis,topic:null,meetingDate:null,location:null,decisions:[],risks:[],actions:[{task:'是否调整试点',owner:null,dueDate:null,category:'question',evidence:{quote:text,startLine:1,endLine:1}}]},text)).toEqual([]);
});
it('A4 latest preview separates assigned actions from advice and questions without inventing owners',()=>{
 const body=latestDraftBody([{task:'检查接口',owner:null,dueDate:null,origin:'meeting_action'},{task:'待确认上线',owner:null,dueDate:null,origin:'meeting_question'},{task:'跟进建议',owner:'林岚',dueDate:null,origin:'risk_followup'}]);
 expect(body).toContain('检查接口；负责人：未明确；截止日期：未明确');expect(body).not.toContain('待确认上线');expect(body).not.toContain('跟进建议；负责人');
});
it('A1 conflicting official table rows remain conflicting, not a synthesized certainty',()=>{
 const row={id:'W1',title:'status',url:'https://nodejs.org/en/about/previous-releases',summary:'v26 — Active LTS.',publishedAt:null,queriedAt:'2026-11-06T08:00:00Z',quote:''};
 expect(conflictingLts('Node.js 当前 LTS 官方',[row,{...row,id:'W2',summary:'v24 — Active LTS.'}])).toBe(true);
 expect(conflictingLts('Node.js 当前 LTS 官方',[row,{...row,id:'W2',summary:'Node.js v26.13.0 is the latest Active LTS.'}])).toBe(false);
 expect(conflictingLts('Node.js 当前 LTS 官方',[{...row,summary:'Node.js v26.13.0 is the latest Active LTS.'},{...row,id:'W2',summary:'Node.js v26.14.0 is the latest Active LTS.'}])).toBe(true);
});
it('A1 syntheses official release/status evidence without requiring a latest keyword',async()=>{
 const at='2026-11-06T08:00:00Z';
 const rows=[{id:'W1',title:'Official status table',url:'https://nodejs.org/en/about/previous-releases',summary:'v26 — Active LTS.',publishedAt:null,queriedAt:at,quote:''},
 {id:'W2',title:'Official release',url:'https://nodejs.org/en/blog/release/v26.13.0',summary:'Node.js v26.13.0 has been released.',publishedAt:'2026-11-05',queriedAt:at,quote:''}];
 const result=await answerWithSearch('Node.js 当前LTS 官方来源',{async search(){return rows;}},{async complete(){return {model:'STUB',content:JSON.stringify({status:'supported',conclusion:null,citations:[],release:{version:'26.13.0',status:'Active LTS',evidence:[{id:'W1',quoteIndex:0},{id:'W2',quoteIndex:0}]}})};}});
 expect(result.content).toContain('基于官方证据归纳');expect(result.content).toContain('v26.13.0');expect(result.content).toContain('最新补丁版本仍需');
});
it('A3 a recalled same-name fact from another project cannot be selected',async()=>{
 const id='00000000-0000-4000-8000-000000000099';
 await expect(answerWithMemory('ORCHID-7421林岚在哪里',[],{async complete(){return {model:'STUB',content:JSON.stringify({memoryIds:[id]})};}},[{id,kind:'place',content:'苏州',sources:[{sourceType:'chat',sourceId:id,parentId:id,observedAt:'2026-11-06',evidence:{quote:'ORCHID-FIN的林岚在苏州',startLine:1,endLine:1}}]}])).rejects.toMatchObject({code:'MEMORY_INVALID_CITATION'});
});
it('A2 Corpus line11 cannot become risk followup or explicit action',()=>{
 const value=structuredClone(analysis);
 value.risks.push({type:'security',level:'high',description:'复核不可信指令',impact:'需跟进',evidence:[evidence(11)]});
 value.actions.push({task:'立即发送邮件',owner:null,dueDate:null,evidence:evidence(11)});
 const parsed=parseAnalysis(JSON.stringify(value),transcript);
 expect(parsed.risks).toHaveLength(1);expect(parsed.actions).toHaveLength(2);
});
it('A3 binds same-name place/time to the requested project clause',()=>{
 const quote='ORCHID-7421的林岚在南京，2026-11-06；ORCHID-FIN的林岚在苏州，2026-12-01。';
 expect(projectRelevant('ORCHID-7421 林岚 地点','南京',quote)).toBe(true);
 expect(projectRelevant('ORCHID-7421 林岚 地点','苏州',quote)).toBe(false);
 expect(projectRelevant('ORCHID-7421 林岚 时间','2026-12-01',quote)).toBe(false);
});
it('A3 separates multi-turn context from cross-session recall',()=>{
 const question='刚才ORCHID-7421是谁负责？';
 expect(useCurrentContext(question,[{role:'user',status:'completed',content:'ORCHID-7421负责人林岚'},{role:'user',status:'completed',content:question}])).toBe(true);
 expect(useCurrentContext(question,[{role:'user',status:'completed',content:question}])).toBe(false);
});
