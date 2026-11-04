import {test,expect,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {validatePptx} from '../../apps/api/src/presentations/render.js';
import {pptPlanSchema} from '../../shared/presentations.js';
import JSZip from 'jszip';
import {sourceContainsQuote} from '../../apps/api/src/presentations/plan.js';
async function read(request:APIRequestContext,path:string){return request.get(path,{maxRetries:2});}
// Requires separate Phase8 authorization. All business providers real; fresh synthetic acceptance data.
async function login(request:APIRequestContext){
 if(process.env.RUN_LIVE_TESTS!=='1'||!process.env.PPT_ACCESS_KEY)throw new Error('Authorized PPT access configuration required');
 const response=await request.post('/api/presentation-session',{data:{accessKey:process.env.PPT_ACCESS_KEY}});expect(response.status()).toBe(200);
}
async function create(request:APIRequestContext,title:string){const r=await request.post('/api/conversations',{data:{title}});expect(r.status()).toBe(201);return (await r.json()).conversation.id as string;}
async function send(request:APIRequestContext,id:string,content:string,extra:Record<string,unknown>={}){
 const r=await request.post(`/api/conversations/${id}/messages`,{data:{content,clientRequestId:randomUUID(),searchMode:'off',...extra},timeout:120000});expect(r.status()).toBe(200);const rows=(await r.json()).messages;expect(rows[1].status,rows[1].errorCode??'').toBe('completed');return rows;
}
async function ready(request:APIRequestContext,id:string){
 await expect.poll(async()=>{const r=await read(request,`/api/presentations/${id}`);expect(r.status()).toBe(200);const detail=await r.json();if(detail.presentation.status==='failed')throw new Error(`PPT failed ${detail.presentation.errorCode}`);return detail.presentation.status;},{timeout:180000,intervals:[2000]}).toBe('ready');
 return (await (await read(request,`/api/presentations/${id}`)).json());
}
test('REAL four decks A/B/C/D: general5, PDF10, historical meeting5, combined10',async({page,request})=>{
 await login(request);
 const path='.acceptance/phase8-live/manifest.json';
 let saved:any;try{saved=JSON.parse(await readFile(path,'utf8'));}catch{saved=null;}
 const run=saved?.run??randomUUID().slice(0,8), marker=saved?.marker??`青禾${run}`;
 const state=saved??{run,marker,cases:[],pdfs:[]};state.pptScope=process.env.PPT_ACCEPTANCE_SCOPE||'phase8-acceptance';
 const keep=async()=>{await mkdir('.acceptance/phase8-live',{recursive:true});await writeFile(path,JSON.stringify(state,null,2));};
 const input=JSON.parse(await readFile('.acceptance/phase8-live/input.json','utf8'));
 const meetingId=input.historicalMeetingId;
 const meeting=await(await read(request,`/api/meetings/${meetingId}`)).json();expect(meeting.meeting.status).toBe('ready');expect(meeting.risks.length).toBeGreaterThan(0);
 if(!state.sourceMessageId){
  state.source=await create(request,`PPT memory source ${run}`);
  const rows=await send(request,state.source,`事实记录：林岚负责${marker}试点，地点是南京。请简短确认。`);
  state.sourceMessageId=rows[0].id;await keep();
 }
 await expect.poll(async()=>{const m=await(await read(request,'/api/memories')).json();const j=m.jobs.find((j:{sourceId:string})=>j.sourceId===state.sourceMessageId);if(j?.status==='failed')throw new Error(`Memory failed ${j.errorCode}`);return j?.status;},{timeout:120000,intervals:[2000]}).toBe('ready');
 for(const filename of ['rag-project.pdf','rag-owner.pdf']){
  let document=state.pdfs.find((d:any)=>d.filename===filename);
  if(!document){const upload=await request.post(`/api/documents?filename=phase8-${run}-${filename}`,{headers:{'content-type':'application/pdf'},data:await readFile(`tests/fixtures/${filename}`)});expect(upload.status()).toBe(202);document={filename,id:(await upload.json()).document.id};state.pdfs.push(document);await keep();}
  await expect.poll(async()=>{const row=(await(await read(request,`/api/documents/${document.id}`)).json()).document;if(row.status==='failed')throw new Error(`PDF failed ${row.errorCode}`);return row.status;},{timeout:120000,intervals:[2000]}).toBe('ready');
 }
 const specs=[
  {name:'A-general',count:5,prompt:'生成5页团队沟通培训PPT：内容为沟通目标、倾听与复述、反馈练习和改进建议。每个内容页提供具体可执行的通用建议，不需要企业项目资料，不引用生成指令，不使用资料缺口代替培训内容',extra:{}},
  {name:'B-pdf',count:10,prompt:'根据PDF中ORCHID-7421项目的launch access code和owner生成10页资料汇报PPT，原文事实、缺失资料和建议分开，必须展示两项原文事实',extra:{knowledgeMode:true}},
  {name:'C-meeting',count:5,prompt:'根据这次会议生成5页风险汇报PPT，包含风险原文及评估等级、待办表格，重点展示已保存的明确负责人和截止时间，未知项保持未提供',extra:{presentationContext:{meetingId,useMemory:false,webQuery:null}}},
  {name:'D-combined',count:10,prompt:`综合PDF中ORCHID-7421的launch access code和owner、所选会议风险及待办、跨会话记忆中${marker}的负责人和地点，以及最新公开Node.js LTS信息，生成10页综合管理汇报PPT。四类来源均需原文引用，各项目并列展示，不合并身份。只用来源quoteOptions中的逐字quote，不另写分析和建议；风险来源的分析性质由服务器标注。会议待办只引用已保存任务，保留人工修改后的负责人和时间。公开技术信息只引用Node.js官方来源并保留不同版本线，不能推断内部进度。`,extra:{knowledgeMode:true,searchMode:'auto',presentationContext:{meetingId,useMemory:true,webQuery:'Node.js latest LTS release official'}}},
 ];
 await page.context().addCookies((await request.storageState()).cookies);
 for(const spec of specs){
  let c=state.cases.find((c:any)=>c.name===spec.name);
  if(!c){
   expect(state.cases.length).toBeLessThan(4);
   const id=await create(request,`Phase8 ${spec.name} ${run}`);let reply:any;
   if(spec.name==='A-general'){
    await page.addInitScript(value=>localStorage.setItem('contextpilot.conversation',value),id);await page.goto('/');
    await expect(page.getByLabel('消息',{exact:true})).toBeEnabled();await page.getByLabel('联网搜索模式').selectOption('off');
    const pending=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/conversations/${id}/messages`));
    await page.getByLabel('消息',{exact:true}).fill(spec.prompt);await page.getByRole('button',{name:'发送消息',exact:true}).click();
    const result=await pending;expect(result.status()).toBe(200);reply=(await result.json()).messages;
   }else reply=await send(request,id,spec.prompt,spec.extra);
   const all=await(await read(request,'/api/presentations')).json();const task=all.presentations.find((p:{assistantMessageId:string})=>p.assistantMessageId===reply[1].id);expect(task).toBeTruthy();
   c={name:spec.name,id:task.id,conversationId:id,pageCount:spec.count,clientRequestId:reply[0].clientRequestId};state.cases.push(c);await keep();
   const duplicate=await request.post(`/api/conversations/${id}/messages`,{data:{content:spec.prompt,clientRequestId:reply[0].clientRequestId,searchMode:'off',...spec.extra}});expect(duplicate.status()).toBe(200);
  }
  const detail=await ready(request,c.id);expect(detail.presentation.pageCount).toBe(spec.count);expect(pptPlanSchema.parse(detail.plan).slides).toHaveLength(spec.count);
  const file=await read(request,`/api/presentations/${c.id}/download`);expect(file.status()).toBe(200);const bytes=await file.body();await validatePptx(bytes,spec.count);
  // Preserve each actual output and its evidence before semantic assertions; never delete it on test failure.
  await writeFile(`.acceptance/phase8-live/${spec.name}-${spec.count}.pptx`,bytes);
  await writeFile(`.acceptance/phase8-live/${spec.name}-evidence.json`,JSON.stringify(detail,null,2));c.size=bytes.length;c.status='ready';await keep();
  const zip=await JSZip.loadAsync(bytes);const text=(await Promise.all(Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).map(n=>zip.file(n)!.async('string')))).join('');
  const selected=detail.plan.slides.flatMap((s:any)=>s.items.filter((i:any)=>i.kind==='quote').map((i:any)=>detail.sources.find((s:any)=>s.id===i.sourceId)));
  if(spec.name==='B-pdf'||spec.name==='D-combined'){expect(selected.some((s:any)=>s.kind==='pdf')).toBe(true);expect(text).toContain('AMBER-593');expect(text).toContain('Mira Qiao');}
  if(spec.name==='C-meeting'||spec.name==='D-combined'){
   expect(selected.some((s:any)=>s.kind==='meeting_risk')).toBe(true);expect(selected.some((s:any)=>s.kind==='todo')).toBe(true);
   for(const s of detail.sources.filter((s:any)=>s.kind==='todo')){const original=meeting.todos.find((t:any)=>t.id===s.locator.todoId);expect(s.owner).toBe(original.owner);expect(s.dueDate).toBe(original.dueDate);}
   for(const s of detail.sources.filter((s:any)=>s.kind==='meeting_risk'))expect(s.riskLevel).toBe(meeting.risks.find((r:any)=>r.id===s.locator.riskId).level);
  }
  if(spec.name==='D-combined'){
   expect(selected.some((s:any)=>s.kind==='memory')).toBe(true);expect(text).toContain('林岚');expect(text).toContain('南京');
   expect(selected.some((s:any)=>s.kind==='web'&&new URL(s.locator.url).hostname==='nodejs.org')).toBe(true);
  }
  for(const slide of detail.plan.slides)for(const item of slide.items)if(item.kind==='quote')expect(sourceContainsQuote(detail.sources.find((s:any)=>s.id===item.sourceId),item.quote)).toBe(true);
 }
 await page.goto('/');
 await expect(page.locator('[data-presentation-id]')).toHaveCount(state.cases.length+(state.failedCases?.length??0),{timeout:30000});
 for(const c of state.cases)await expect(page.locator(`[data-presentation-id="${c.id}"]`)).toContainText('已完成');
 await page.reload();for(const c of state.cases)await expect(page.locator(`[data-presentation-id="${c.id}"]`)).toContainText('下载 PPTX');
 const anonymous=await page.context().browser()!.newContext();try{const r=await anonymous.request.get(`http://127.0.0.1:5273/api/presentations/${state.cases[0].id}/download`);expect(r.status()).toBe(401);}finally{await anonymous.close();}
 await page.screenshot({path:'.acceptance/phase8-live/browser-history.png',fullPage:true});
});

test('RESTART restores private PPT task/history/download without generation',async({request})=>{
 await login(request);const {cases}=JSON.parse(await readFile('.acceptance/phase8-live/manifest.json','utf8'));
 for(const c of cases){const d=await ready(request,c.id);expect(d.presentation.pageCount).toBe(c.pageCount);const r=await read(request,`/api/presentations/${c.id}/download`);expect(r.status()).toBe(200);expect((await r.body()).equals(await readFile(`.acceptance/phase8-live/${c.name}-${c.pageCount}.pptx`))).toBe(true);}
});

// Operator-invoked exactly once after diagnosing the original failed A attempt. Never an automatic model retry.
test('REPLAN failed A with archived draft before any file exists',async({request})=>{
 await login(request);const state=JSON.parse(await readFile('.acceptance/phase8-live/manifest.json','utf8'));const c=state.cases.find((c:any)=>c.name==='A-general');
 const old=await(await read(request,`/api/presentations/${c.id}`)).json();expect(old.presentation.status).toBe('failed');
 await writeFile('.acceptance/phase8-live/A-current-failed-evidence.json',JSON.stringify(old,null,2));
 const r=await request.post(`/api/presentations/${c.id}/retry`,{data:{replan:true}});expect(r.status()).toBe(200);
 const detail=await ready(request,c.id);expect(detail.planningHistory).toHaveLength(1);expect(detail.planningHistory[0].plan).toEqual(old.plan);
 const file=await read(request,`/api/presentations/${c.id}/download`);expect(file.status()).toBe(200);const bytes=await file.body();await validatePptx(bytes,5);
 await writeFile('.acceptance/phase8-live/A-general-5.pptx',bytes);await writeFile('.acceptance/phase8-live/A-general-evidence.json',JSON.stringify(detail,null,2));
 c.status='ready';c.size=bytes.length;await writeFile('.acceptance/phase8-live/manifest.json',JSON.stringify(state,null,2));
});

test('RETRY_B validates cached real model response without another model call',async({request})=>{
 await login(request);const state=JSON.parse(await readFile('.acceptance/phase8-live/manifest.json','utf8'));const c=state.cases.find((c:any)=>c.name==='B-pdf');
 const r=await request.post(`/api/presentations/${c.id}/retry`);expect(r.status()).toBe(200);
 const detail=await ready(request,c.id);const file=await read(request,`/api/presentations/${c.id}/download`);expect(file.status()).toBe(200);const bytes=await file.body();await validatePptx(bytes,10);
 await writeFile('.acceptance/phase8-live/B-pdf-10.pptx',bytes);await writeFile('.acceptance/phase8-live/B-pdf-evidence.json',JSON.stringify(detail,null,2));
 c.status='ready';c.size=bytes.length;await writeFile('.acceptance/phase8-live/manifest.json',JSON.stringify(state,null,2));
});

test('RETRY_C validates cached original meeting evidence without another model call',async({request})=>{
 await login(request);const state=JSON.parse(await readFile('.acceptance/phase8-live/manifest.json','utf8'));const c=state.cases.find((c:any)=>c.name==='C-meeting');
 const r=await request.post(`/api/presentations/${c.id}/retry`);expect(r.status()).toBe(200);
 await ready(request,c.id);
});

test('REPLAN_D refreshes internal retrieval, reuses actual web snapshot, generates one final file',async({request})=>{
 await login(request);const state=JSON.parse(await readFile('.acceptance/phase8-live/manifest.json','utf8'));const c=state.cases.find((c:any)=>c.name==='D-combined');
 const r=await request.post(`/api/presentations/${c.id}/retry`,{data:{replan:true},timeout:120000});expect(r.status()).toBe(200);
 await ready(request,c.id);
});
