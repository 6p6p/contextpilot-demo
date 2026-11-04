// Approved B/D amendment only. All model/search/embedding transports are blocked.
import 'dotenv/config';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from '../apps/api/src/config/env.js';
import {createDatabase} from '../apps/api/src/db/client.js';
import {createStorage} from '../apps/api/src/knowledge/storage.js';
import {createRepairPublisher,sha256,publicationSchema} from '../apps/api/src/presentations/publication.js';
import {validatePptx} from '../apps/api/src/presentations/render.js';
const env=parseEnv(process.env),db=createDatabase(env)!;
if(!db||env.EMAIL_DELIVERY_ENABLED)throw new Error('Unsafe acceptance configuration');
const original=globalThis.fetch;let calls=0,transferred=0;
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.origin!==new URL(env.SUPABASE_URL!).origin||!url.pathname.startsWith('/storage/v1/')||!['GET','POST'].includes(init?.method??'GET')||calls>=80||transferred>5000000)throw new Error('Acceptance transport blocked');
 calls++;const response=await original(input,init);transferred+=(await response.clone().arrayBuffer()).byteLength;
 return response;
};
const storage=createStorage(env)!;const root='.acceptance/phase8-live';
try{
 const manifest=JSON.parse(await readFile(`${root}/manifest.json`,'utf8'));
 const approved:Record<string,string>={'A-general':'25b7d597-7f67-47f8-ace1-a0207c239fcd','B-pdf':'430adf3e-8191-4940-a5bd-f8359ec50633','C-meeting':'c148bb93-5051-49eb-86df-bbd0c9f0e500','D-combined':'bd1c33d7-872b-4a91-af3f-b39408c1dc3a'};
 if(manifest.pptScope!=='phase8-acceptance-v2'||manifest.cases.length!==4||new Set(manifest.cases.map((c:any)=>c.name)).size!==4||manifest.cases.some((c:any)=>approved[c.name]!==c.id))throw new Error('Outside approved acceptance scope');
 const repairs=JSON.parse(await readFile(`${root}/repair-record.json`,'utf8'));
 const publish=createRepairPublisher(db,storage,manifest.pptScope);
 const results=[];
 for(const c of manifest.cases){
  const {rows}=await db.pool.query('select * from presentation_jobs where id=$1 and scope=$2',[c.id,manifest.pptScope]);const r=rows[0];
  if(!r||r.status!=='ready'||r.storage_origin!==storage.origin||r.storage_bucket!==storage.bucket)throw new Error('Task configuration mismatch');
  const local=await readFile(`${root}/${c.name}-${c.pageCount}.pptx`);await validatePptx(local,c.pageCount);
  if(['B-pdf','D-combined'].includes(c.name)){
   const fix=repairs.find((v:any)=>v.name===c.name);if(sha256(local)!==fix.repairedSha256)throw new Error('Reviewed candidate changed');
   const detail=JSON.parse(await readFile(`${root}/${c.name}-repaired-evidence.json`,'utf8'));
   const input={jobId:c.id,revisionId:c.id,parentSha:fix.originalSha256,plan:detail.plan,bytes:local};
   const record=await publish(input);await publish(input); // Actual idempotent replay.
   const old=await storage.find!(record.parent.key);if(!old||sha256(old)!==record.parent.sha)throw new Error('Original object not retained');
  }else if(sha256(local)!==r.sha256)throw new Error('A/C changed');
  const current=(await db.pool.query('select * from presentation_jobs where id=$1',[c.id])).rows[0];
  const remote=await storage.find!(current.object_key);
  if(!remote||sha256(remote)!==sha256(local)||remote.length!==current.size||current.sha256!==sha256(local))throw new Error('Cloud/current/local mismatch');
  await validatePptx(remote,c.pageCount);
  results.push({name:c.name,pageCount:c.pageCount,status:current.status,sha256:sha256(local),version:current.context.artifactPublication?2:1,originalRetained:current.context.artifactPublication?publicationSchema.parse(current.context.artifactPublication).state==='published':true});
 }
 await writeFile(`${root}/cloud-final-receipt.json`,JSON.stringify({results,storageRequests:calls,responseBytes:transferred,modelCalls:0,embeddingCalls:0,searchCalls:0},null,2));
 console.log(JSON.stringify({results,storageRequests:calls,responseBytes:transferred}));
}catch{console.error('Sanitized cloud acceptance failed; pending publication remains tracked.');process.exitCode=1;}finally{await db.pool.end();}
