import {it,expect,vi} from 'vitest';
import {isPresentationIntent} from '../../apps/api/src/presentations/intent.js';
import {readFileSync} from 'node:fs';
import {planPresentation} from '../../apps/api/src/presentations/plan.js';
import {verifyContentQuality} from '../../apps/api/src/presentations/coverage.js';
it('V132 explicit training request with negative meta-guidance still routes to PPT',()=>{
 expect(isPresentationIntent('请生成一份 5 页中文 PPT，标题为《如何提高团队沟通效率》，面向企业新员工。直接提供可以用于培训的具体内容，包含常见沟通障碍、有效倾听、反馈技巧、团队协作案例及总结，不要输出制作 PPT 的指导建议。')).toBe(true);
 expect(isPresentationIntent('不要生成5页PPT')).toBe(false);
});
it('V132 real complete training planning is not rejected just for paraphrasing topic words',async()=>{
 const a=JSON.parse(readFileSync('tests/fixtures/v132/training-response.json','utf8'));
 await expect(planPresentation({async complete(){return {model:'REPLAY',content:JSON.stringify(a.output)};}},a.request,5,[{id:'R',kind:'request',classification:'fact',text:a.request,title:'合成要求',locator:{}}],8192)).resolves.toHaveProperty('slides');
});
it('V132 negative analysis is not a positive postponement assertion',()=>{
 const items=JSON.parse(readFileSync('tests/fixtures/v132/negative-analysis.json','utf8'));
 expect(()=>verifyContentQuality({slides:[{kind:'cover',items:[]},{kind:'risk',items:[{kind:'quote',sourceId:'S10',quote:'并非已确认延期'},...items]},{kind:'references',items:[]}]},[{id:'S10',kind:'meeting_risk',classification:'analysis',text:'并非已确认延期',title:'合成风险',locator:{}}])).not.toThrow();
});
