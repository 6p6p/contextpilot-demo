import { mkdir,writeFile } from 'node:fs/promises';
import { renderPresentation } from '../apps/api/src/presentations/render.js';
import { pptPlan,pptTen,pptSources } from '../tests/support/presentation-fixtures.js';
// Offline synthetic QA only. Not a real model/Storage acceptance artifact.
await mkdir('.acceptance/phase8-offline',{recursive:true});
for(const [count,plan] of [[5,pptPlan],[10,pptTen]] as const){
 const output=await renderPresentation(plan,pptSources,'青杉试点风险汇报',new Date('2026-01-01T00:00:00Z'));
 await writeFile(`.acceptance/phase8-offline/fixture-${count}.pptx`,output.bytes);
 await writeFile(`.acceptance/phase8-offline/fixture-${count}-geometry.json`,JSON.stringify(output.boxes,null,2));
 console.log(`Offline synthetic PPTX: ${count} slides, ${output.bytes.length} bytes`);
}

const denseText='供应商交付存在不确定性，相关原始凭据尚需进一步复核。'.repeat(4).slice(0,88);
const denseSources=[...pptSources,{...pptSources[0],id:'S5',text:denseText}];
const dense=structuredClone(pptPlan);
dense.slides[1].items=Array.from({length:3},()=>({kind:'quote' as const,sourceId:'S5',quote:denseText}));
dense.slides[3].items=Array.from({length:3},()=>({kind:'quote' as const,sourceId:'S3',quote:'复核供应商交付清单'}));
const output=await renderPresentation(dense,denseSources,'高密度排版边界检查',new Date('2026-01-01T00:00:00Z'));
await writeFile('.acceptance/phase8-offline/fixture-dense.pptx',output.bytes);
