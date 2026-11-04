// Offline-only reviewed repair: no env loading, network or database access.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderPresentation} from '../apps/api/src/presentations/render.js';
import {parsePresentationRequest} from '../apps/api/src/presentations/intent.js';
const root='.acceptance/phase8-live';
const backup=`${root}/original-before-defect-fix`;
globalThis.fetch=async()=>{throw new Error('Network forbidden in offline repair');};
await mkdir(backup,{recursive:true});
const changes=[];
for(const name of ['B-pdf','D-combined']){
 const file=`${name}-10.pptx`,evidence=`${name}-evidence.json`;
 // Never overwrite an earlier preserved original on repeated invocation.
 for(const f of [file,evidence])await copyFile(`${root}/${f}`,`${backup}/${f}`,1).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='EEXIST')throw e;});
 const detail=JSON.parse(await readFile(`${backup}/${evidence}`,'utf8'));
 const old=await readFile(`${backup}/${file}`);
 if(name==='D-combined')detail.plan.slides[8].items=detail.plan.slides[8].items.filter((i:{sourceId?:string})=>i.sourceId!=='S25');
 else detail.plan.slides[6].items=detail.plan.slides[6].items.filter((i:{text?:string})=>i.text!=='访问码与负责人信息明确，可直接支撑启动环节的执行');
 const {bytes}=await renderPresentation(detail.plan,detail.sources,parsePresentationRequest(detail.sources.find((s:{kind:string})=>s.kind==='request').text).topic,new Date(detail.presentation.createdAt));
 await writeFile(`${root}/${file}`,bytes);
 await writeFile(`${root}/${name}-repaired-evidence.json`,JSON.stringify({...detail,localRepair:true,cloudSynchronized:false},null,2));
 const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 changes.push({name,originalSha256:sha(old),repairedSha256:sha(bytes),pages:10,action:name==='D-combined'?'Remove unsupported incomplete S25 quotation; do not replace URL or claim':'Remove unsupported launch-execution inference',cloudSynchronized:false});
}
await writeFile(`${root}/repair-record.json`,JSON.stringify(changes,null,2));
console.log(JSON.stringify(changes));
