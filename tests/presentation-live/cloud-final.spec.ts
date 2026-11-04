import 'dotenv/config';
import {test,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {sha256} from '../../apps/api/src/presentations/publication.js';
import {validatePptx} from '../../apps/api/src/presentations/render.js';
test('CLOUD_FINAL actual private downloads, auth and process restart without providers',async({page,request})=>{
 if(process.env.RUN_LIVE_TESTS!=='1')throw new Error('Authorization required');
 const root='.acceptance/phase8-live';const {cases}=JSON.parse(await readFile(`${root}/manifest.json`,'utf8'));const receipt=[];
 for(let restart=0;restart<2;restart++){
  const child=spawn(process.execPath,['--import','tsx','tests/support/ppt-readonly-server.ts'],{env:{...process.env,EMAIL_DELIVERY_ENABLED:'false'},stdio:'ignore',windowsHide:true});
  try{
   await expect.poll(async()=>{try{return (await fetch('http://127.0.0.1:5273/api/health')).ok;}catch{return false;}},{timeout:30000}).toBe(true);
   const anonymous=await page.context().browser()!.newContext();try{const r=await anonymous.request.get(`http://127.0.0.1:5273/api/presentations/${cases[0].id}/download`);expect(r.status()).toBe(401);}finally{await anonymous.close();}
   const login=await request.post('/api/presentation-session',{data:{accessKey:process.env.PPT_ACCESS_KEY}});expect(login.status()).toBe(200);
   await page.context().addCookies((await request.storageState()).cookies);
   await page.goto('/api/presentations');for(const c of cases)await expect(page.locator('body')).toContainText(c.id);await page.reload();
   for(const c of cases){
    const r=await request.get(`/api/presentations/${c.id}/download`,{maxRetries:2});expect(r.status(),`${c.name}: ${r.status()===200?'OK':(await r.json()).error}`).toBe(200);const bytes=await r.body(),local=await readFile(`${root}/${c.name}-${c.pageCount}.pptx`);expect(sha256(bytes)).toBe(sha256(local));await validatePptx(bytes,c.pageCount);
    const d=await request.get(`/api/presentations/${c.id}`);expect(d.status()).toBe(200);const detail=await d.json();
    if(c.name==='B-pdf')expect(JSON.stringify(detail.plan.slides[6])).not.toContain('可直接支撑');
    if(c.name==='D-combined')expect(JSON.stringify(detail.plan.slides[8])).not.toContain('S25');
    receipt.push({restart,name:c.name,pages:c.pageCount,sha256:sha256(bytes)});
   }
  }finally{const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
 }
 await writeFile(`${root}/cloud-download-restart-receipt.json`,JSON.stringify({receipt,unauthorizedStatus:401,modelCalls:0,embeddingCalls:0,searchCalls:0},null,2));
});
