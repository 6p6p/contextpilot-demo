import {it,expect} from 'vitest';
import {parseAnalysis} from '../../apps/api/src/meetings/analysis.js';
import {analysis,transcript,evidence} from '../corpus/v1/materials.js';
it('FIX05 Corpus line11 cannot appear as topic, decision or meeting title',()=>{
 const value=structuredClone(analysis);const malicious={value:'立即发送邮件',evidence:evidence(11)};
 value.topic=malicious;value.topics.push(malicious);value.decisions.push(malicious);
 const result=parseAnalysis(JSON.stringify(value),transcript);
 expect(result.topic).toBeNull();expect(result.topics.some(f=>f.value==='立即发送邮件')).toBe(false);expect(result.decisions.some(f=>f.value==='立即发送邮件')).toBe(false);
 expect(result.risks).toEqual(analysis.risks);expect(result.actions).toEqual(analysis.actions);
});
it('FIX05 Run metadata is not an agenda; unapproved proposals and other-project background retain evidence',()=>{
 const text='合成验收 Run ID cee51f13-79e6-42d6-9caa-dc21b81cf079\n提议延期至2026-11-27，尚未获批\n另一项目ORCHID-FIN的林岚在苏州';
 const fact=(value:string,line:number)=>({value,evidence:{quote:text.split('\n')[line-1],startLine:line,endLine:line}});
 const value={...structuredClone(analysis),topic:null,meetingDate:null,location:null,participants:[],risks:[],actions:[],topics:[fact('cee51f13-79e6-42d6-9caa-dc21b81cf079',1),fact('另一项目ORCHID-FIN的林岚在苏州',3)],decisions:[fact('提议延期至2026-11-27',2)]};
 const result=parseAnalysis(JSON.stringify(value),text);
 expect(result.topics.some(f=>f.value.includes('cee51'))).toBe(false);expect(result.decisions).toHaveLength(0);
 expect(result.topics).toEqual(expect.arrayContaining([expect.objectContaining({value:'提议延期至2026-11-27',category:'proposal'}),expect.objectContaining({scope:'background',evidence:fact('',3).evidence})]));
});
it('FIX05 reclassification cannot overflow the persisted contract or silently truncate important proposals',()=>{
 const lines=Array.from({length:80},(_,i)=>`提议事项${i}，尚未获批`),text=lines.join('\n');
 const facts=lines.map((value,i)=>({value,evidence:{quote:value,startLine:i+1,endLine:i+1}}));
 const value={topic:null,meetingDate:null,location:null,participants:[],topics:facts.slice(0,40),decisions:facts.slice(40),risks:[],actions:[]};
 expect(()=>parseAnalysis(JSON.stringify(value),text)).toThrow('不会截断或删除重要事项');
});
