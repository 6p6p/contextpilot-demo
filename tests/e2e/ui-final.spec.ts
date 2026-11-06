import {test,expect,type Page} from '@playwright/test';

const at='2026-11-06T08:00:00Z',a='00000000-0000-4000-8000-000000000201',b='00000000-0000-4000-8000-000000000202';
const pdf='00000000-0000-4000-8000-000000000203',meeting='00000000-0000-4000-8000-000000000204';
const row=(role:string,content:string,ordinal:number)=>({id:crypto.randomUUID(),conversationId:a,clientRequestId:crypto.randomUUID(),role,content,ordinal,status:'completed',model:'UI-FIXTURE',errorCode:null as string|null,createdAt:at,updatedAt:at});
async function fixture(page:Page){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Business UI fixtures have their own synthetic authenticated session. Actual
 // login/rate limits/private endpoint rejection stay in workspace.spec.ts.
 await page.route('**/api/demo-session',r=>r.fulfill({json:{required:true,authenticated:true}}));
 const state={inputs:[] as any[],messages:[row('user','帮我整理 ORCHID-7421 的项目概况与行动建议。',0),row('assistant','## 项目概况\n项目负责人为 **Dr. Mira Qiao**，试点目标是 **2026-11-20**。\n\n| 事项 | 当前状态 |\n| --- | --- |\n| 供应商接口 | 尚未交付，存在联调风险 |\n| 改期提议 | 尚未获批，不是正式决定 |\n\n下一步请复核交付清单，明确接口验收条件。',1)],mode:'success' as 'success'|'http-failure'|'model-failure',gate:null as null|Promise<void>,renamed:false,archived:false};
 state.messages[0].content='生成 5 页《ORCHID-7421 项目概况》PPT，概括当前进度与行动建议。';state.messages[1].clientRequestId=state.messages[0].clientRequestId;
 Object.assign(state.messages[1],{sources:[{sourceId:pdf,documentId:pdf,filename:'ORCHID-7421 项目资料.pdf',page:1,quote:'项目负责人：Dr. Mira Qiao。'}],webSources:[{id:'W1',title:'公开参考 · UI 合成快照',url:'https://example.org/public-reference',summary:'仅用于检查链接与折叠；未发起真实搜索。',queriedAt:at,publishedAt:null,quote:''}]});
 await page.route('**/api/health',r=>r.fulfill({json:{status:'ok',service:'contextpilot-api',database:'not_checked'}}));
 const conversations=[{id:a,title:'ORCHID-7421 项目讨论',createdAt:at,updatedAt:at},{id:b,title:'团队沟通培训',createdAt:at,updatedAt:at},...Array.from({length:32},(_,i)=>({id:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`,title:`历史讨论 ${i+1} · 交付进展与项目管理`,createdAt:at,updatedAt:at}))];
 await page.route('**/api/conversations',r=>r.fulfill({json:{conversations:state.archived?conversations.filter(c=>c.id!==a):conversations}}));
 await page.route(`**/api/conversations/${a}`,r=>{if(r.request().method()==='PATCH'){conversations[0].title=r.request().postDataJSON().title;state.renamed=true;}else if(r.request().method()==='DELETE')state.archived=true;return r.fulfill({json:{id:a,retained:true}});});
 await page.route('**/api/conversations/*/messages',async r=>{
  if(r.request().method()==='POST'){
   const input=r.request().postDataJSON();state.inputs.push(input);if(state.gate)await state.gate;
   if(state.mode==='http-failure')return r.fulfill({status:503,json:{error:{message:'合成网络失败，输入未丢失'}}});
   const user={...row('user',input.content,state.messages.length),clientRequestId:input.clientRequestId};
   const assistant={...row('assistant','已收到，继续基于所选资料讨论。',state.messages.length+1),clientRequestId:input.clientRequestId,status:state.mode==='model-failure'?'failed':'completed',errorCode:state.mode==='model-failure'?'SYNTHETIC_MODEL_FAILURE':null};state.messages.push(user,assistant);
  }
  return r.fulfill({json:{messages:r.request().url().includes(b)?[row('assistant','这是另一段独立对话。',0)]:state.messages}});
 });
 await page.route('**/api/documents*',r=>r.fulfill({json:{documents:[{id:pdf,filename:'ORCHID-7421 项目资料.pdf',size:240,status:'ready',pageCount:3,chunkCount:3,errorCode:null,errorMessage:null,createdAt:at,updatedAt:at}]}}));
 await page.route('**/api/meetings',r=>r.fulfill({json:{meetings:[{id:meeting,filename:'ORCHID-7421 项目周会.txt',status:'ready'}]}}));
 await page.route('**/api/memories',r=>r.fulfill({json:{configured:true,memories:[],jobs:[]}}));
 await page.route('**/api/presentations*',r=>r.fulfill({json:{presentations:[{id:meeting,assistantMessageId:state.messages[1].id,conversationId:a,filename:'ContextPilot-00000000-0000-4000-8000-000000000204.pptx',pageCount:5,status:'ready',errorCode:null,errorMessage:null,retries:0,size:200,createdAt:at,updatedAt:at}]}}));
 await page.goto('/');
 await expect(page.locator('#chat-input')).toBeEnabled();return {state,errors};
}

test('compact PDF multi-select: filter, persistence, counts, long list and exact payload (UI fixtures)',async({page})=>{
 const {state,errors}=await fixture(page);
 const docs=Array.from({length:45},(_,i)=>({id:`20000000-0000-4000-8000-${String(i).padStart(12,'0')}`,filename:i===44?'不可用资料.pdf':`项目资料-${String(i).padStart(2,'0')}.pdf`,size:200,status:i===44?'failed':'ready',pageCount:2,chunkCount:2,errorCode:null,errorMessage:null,createdAt:at,updatedAt:at}));
 await page.route('**/api/documents',r=>r.fulfill({json:{documents:docs}}));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:844});const plus=page.getByRole('button',{name:'添加上下文'}),trigger=page.getByRole('button',{name:'选择知识库 PDF',exact:true});
  await plus.click();await expect(trigger).toHaveText('选择 PDF（可多选）');await expect(page.getByLabel('选择PDF 项目资料-00.pdf')).toHaveCount(0);await expect(page.getByLabel('附件会议')).toBeVisible();
  await trigger.click();await expect(page.getByLabel('搜索 PDF 文件名')).toBeFocused();await expect(page.getByLabel('选择PDF 不可用资料.pdf')).toBeDisabled();
  const list=page.getByRole('group',{name:'PDF 文件列表'});await expect(list.locator('label')).toHaveCount(45);expect(await list.evaluate(e=>e.clientHeight<=300&&e.scrollHeight>e.clientHeight)).toBe(true);
  await page.getByLabel('搜索 PDF 文件名').fill('资料-00');await page.getByLabel('选择PDF 项目资料-00.pdf').check();await expect(trigger).toHaveText('已选择 1 份 PDF');await page.getByLabel('搜索 PDF 文件名').fill('');await expect(page.getByLabel('选择PDF 项目资料-00.pdf')).toBeChecked();
  await page.getByLabel('选择PDF 项目资料-01.pdf').check();await expect(trigger).toHaveText('已选择 2 份 PDF');
  await page.screenshot({path:`test-results/pdf-multi-${width}.png`});const rect=await page.getByRole('dialog',{name:'选择知识库 PDF',exact:true}).boundingBox();expect(rect&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=844).toBeTruthy();
  await page.keyboard.press('Escape');await expect(trigger).toHaveAttribute('aria-expanded','false');await expect(plus).toHaveAttribute('aria-expanded','true');await trigger.click();await expect(page.getByLabel('选择PDF 项目资料-00.pdf')).toBeChecked();
  await page.getByText('联网与知识库设置',{exact:true}).click();await expect(trigger).toHaveAttribute('aria-expanded','false');await expect(page.getByLabel('附件会议')).toHaveValue('');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'移除附件 项目资料-00.pdf'}).click();await plus.click();await expect(trigger).toHaveText('已选择 1 份 PDF');await trigger.click();await page.getByLabel('选择PDF 项目资料-00.pdf').check();await page.getByLabel('选择PDF 项目资料-00.pdf').uncheck();await page.getByRole('button',{name:'清空选择',exact:true}).click();await expect(trigger).toHaveText('选择 PDF（可多选）');
  await page.getByLabel('搜索 PDF 文件名').fill('不存在');await expect(page.getByText('没有匹配的 PDF。')).toBeVisible();await page.getByLabel('搜索 PDF 文件名').fill('');await page.getByLabel('选择PDF 项目资料-00.pdf').check();await page.getByLabel('选择PDF 项目资料-01.pdf').check();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.getByRole('heading',{level:1}).click();await expect(plus).toHaveAttribute('aria-expanded','false');await plus.click();await expect(trigger).toHaveText('已选择 2 份 PDF');await page.keyboard.press('Escape');
  await page.locator('#chat-input').fill('根据所选 PDF 回答项目问题');await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect(page.locator('#chat-input')).toHaveValue('');expect(state.inputs.at(-1)).toMatchObject({knowledgeMode:true,documentIds:[docs[0].id,docs[1].id],presentationContext:{documentIds:[docs[0].id,docs[1].id],meetingId:null}});
  await plus.click();await trigger.click();await page.getByRole('button',{name:'清空选择',exact:true}).click();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 }
 expect(errors).toEqual([]);
});

test('final composer: IME, multiline, duplicate guard, source payload and failure recovery (UI fixtures)',async({page})=>{
 const {state,errors}=await fixture(page);const input=page.locator('#chat-input'),plus=page.getByRole('button',{name:'添加上下文'}),send=page.getByRole('button',{name:'发送消息',exact:true});
 await expect(send).toBeDisabled();await expect(page.getByText('后端已连接')).toHaveCount(0);
 await plus.click();await page.getByRole('button',{name:'选择知识库 PDF',exact:true}).click();await page.getByLabel('选择PDF ORCHID-7421 项目资料.pdf').check();await page.keyboard.press('Escape');await page.getByLabel('附件会议').selectOption(meeting);
 await page.getByText('联网与知识库设置',{exact:true}).click();await expect(page.getByLabel('联网搜索模式')).toHaveValue('auto');
 for(const value of ['off','required','auto','required']){await page.getByLabel('联网搜索模式').selectOption(value);await expect(page.getByLabel('联网搜索模式')).toHaveValue(value);}
 await page.getByLabel('使用 PDF 知识库').check();await page.getByLabel('问答 PDF 范围').selectOption('selected');await page.getByLabel('问答 PDF 文件').selectOption(pdf);
 await page.keyboard.press('Escape');await expect(plus).toBeFocused();
 await input.fill('根据所选资料继续讨论');await input.dispatchEvent('compositionstart');await input.press('Enter');expect(state.inputs).toHaveLength(0);await input.dispatchEvent('compositionend');await input.fill('根据所选资料继续讨论');await input.press('Shift+Enter');await expect(input).toHaveValue('根据所选资料继续讨论\n');
 let release!:()=>void;state.gate=new Promise<void>(r=>{release=r;});await input.press('Enter');await expect.poll(()=>state.inputs.length).toBe(1);await expect(send).toBeDisabled();await input.dispatchEvent('keydown',{key:'Enter',code:'Enter'});expect(state.inputs).toHaveLength(1);release();state.gate=null;await expect(input).toHaveValue('');
 expect(state.inputs[0]).toMatchObject({knowledgeMode:true,documentIds:[pdf],searchMode:'required',presentationContext:{documentIds:[pdf],meetingId:meeting,useMemory:false,webQuery:null}});
 state.mode='http-failure';await input.fill('失败后保留原始问题');await input.press('Enter');await expect(page.getByRole('alert').filter({hasText:'合成网络失败'})).toBeVisible();await expect(input).toHaveValue('失败后保留原始问题');await expect(page.getByRole('button',{name:'移除会议附件'})).toBeVisible();
 state.mode='model-failure';await input.press('Enter');await expect(page.getByText(/回复失败（SYNTHETIC_MODEL_FAILURE/)).toBeVisible();await expect(input).toHaveValue('失败后保留原始问题');
 await page.getByRole('button',{name:'移除会议附件'}).click();await page.getByRole('button',{name:'移除附件 ORCHID-7421 项目资料.pdf'}).click();await expect(page.locator('.attachment-tags')).toBeEmpty();
 await input.fill(Array.from({length:20},()=> '长内容自动增长并在输入框内部滚动').join('\n'));expect(await input.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);await expect(send).toBeInViewport();expect(errors).toEqual([]);
 let finishUpload!:()=>void,started=false;const uploadGate=new Promise<void>(resolve=>{finishUpload=resolve;});
 await page.route('**/api/documents?filename=*',async r=>{started=true;await uploadGate;return r.fulfill({json:{document:{id:pdf}}});});
 await plus.click();await page.getByLabel('附件上传 PDF').setInputFiles({name:'旧会话异步上传.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-UI-STUB')});await expect.poll(()=>started).toBe(true);
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'团队沟通培训',exact:true}).click();await expect(page.getByText('这是另一段独立对话。')).toBeVisible();finishUpload();await expect(page.getByText('正在准备所选 PDF…')).toHaveCount(0);await expect(page.locator('.attachment-tags')).toBeEmpty();await expect(plus).toHaveAttribute('aria-expanded','false');
});

test('final visual layout, history menu and navigation at four widths (UI fixtures)',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});const {state,errors}=await fixture(page);
 expect((await page.getByRole('button',{name:'ORCHID-7421 项目讨论',exact:true}).boundingBox())!.width).toBeGreaterThan(150);
 await test.info().attach('computed-ui-style',{body:JSON.stringify(await page.locator('.brand').evaluate(e=>({font:getComputedStyle(e).fontFamily,width:e.getBoundingClientRect().width}))),contentType:'application/json'});
 await expect(page.getByRole('link',{name:'下载 PPTX'})).toHaveAttribute('href',`/api/presentations/${meeting}/download`);
 await expect(page.locator('.file-body>strong')).toHaveText('ORCHID-7421 项目概况');await expect(page.getByText('PPTX · 5 页 · 已完成')).toBeVisible();
 await expect(page.locator('.citation[open]')).toHaveCount(0);await expect(page.getByRole('link',{name:'公开参考 · UI 合成快照'})).toHaveAttribute('href','https://example.org/public-reference');const pdfDetails=page.locator('details.citation').filter({hasText:'下载原始 PDF 核对'});await pdfDetails.locator('summary').click();await expect(page.getByRole('link',{name:'下载原始 PDF 核对'})).toHaveAttribute('href',`/api/documents/${pdf}/download`);await pdfDetails.locator('summary').click();
 const menu=page.getByRole('button',{name:'会话操作 ORCHID-7421 项目讨论'});await menu.focus();await menu.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'重命名'})).toBeFocused();await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'归档会话'})).toBeFocused();await page.screenshot({path:'test-results/final-history-menu.png'});await page.keyboard.press('Escape');await expect(menu).toBeFocused();
 await menu.click();await page.locator('h1').click();await expect(page.getByRole('menu')).toHaveCount(0);await menu.click();await page.getByRole('menuitem',{name:'重命名'}).click();await page.getByLabel('会话名称').fill('ORCHID-7421 管理层讨论');await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();await expect.poll(()=>state.renamed).toBe(true);
 await page.getByRole('button',{name:'团队沟通培训',exact:true}).click();await expect(page.getByText('这是另一段独立对话。')).toBeVisible();await page.getByRole('button',{name:'ORCHID-7421 管理层讨论',exact:true}).click();await expect(page.getByRole('columnheader',{name:'事项'})).toBeVisible();
 await page.getByRole('button',{name:'收起侧栏'}).click();await expect(page.locator('.workspace')).toHaveClass(/sidebar-collapsed/);await page.getByRole('button',{name:'展开侧栏'}).click();
 for(const width of [1440,1024,768,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2)).toBe(true);
  await expect(page.getByRole('button',{name:'发送消息',exact:true})).toBeInViewport();await expect(page.getByRole('button',{name:'添加上下文'})).toBeInViewport();
  await page.screenshot({path:`test-results/final-chat-${width}.png`});
  if(width<=800){await page.getByRole('button',{name:'展开侧栏'}).click();await expect(page.getByRole('dialog',{name:'导航与历史'})).toBeVisible();await page.screenshot({path:`test-results/final-sidebar-${width}.png`});await page.getByRole('button',{name:'会话操作 ORCHID-7421 管理层讨论'}).click();await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);await expect(page.getByRole('dialog',{name:'导航与历史'})).toBeVisible();await page.getByRole('button',{name:'会话操作 ORCHID-7421 管理层讨论'}).click();await page.getByRole('menuitem',{name:'归档会话'}).click();await expect(page.getByRole('dialog',{name:'归档会话',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'归档会话',exact:true})).not.toBeVisible();expect(state.archived).toBe(false);await expect(page.getByRole('dialog',{name:'导航与历史'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'展开侧栏'})).toBeFocused();}
  await page.getByRole('button',{name:'添加上下文'}).click();await page.getByRole('button',{name:'选择知识库 PDF',exact:true}).click();await page.getByLabel('选择PDF ORCHID-7421 项目资料.pdf').check();await page.keyboard.press('Escape');await page.getByLabel('附件会议').selectOption(meeting);await page.getByText('联网与知识库设置',{exact:true}).click();
  const rect=await page.getByRole('dialog',{name:'添加上下文',exact:true}).boundingBox();expect(rect&&rect.x>=0&&rect.x+rect.width<=width&&rect.y>=0&&rect.y+rect.height<=(width===390?844:1000)).toBeTruthy();await page.screenshot({path:`test-results/final-tools-${width}.png`});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'移除附件 ORCHID-7421 项目资料.pdf'}).click();await page.getByRole('button',{name:'移除会议附件'}).click();
 }
 for(const [label,name] of [['知识库','PDF 知识库'],['长期记忆','长期记忆'],['PPT 文件','PPT 历史文件']]){await page.getByRole('button',{name:'展开侧栏'}).click();await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByRole('heading',{level:2,name,exact:true})).toBeVisible();await page.screenshot({path:`test-results/final-tool-${label}.png`});}
 await page.reload();await expect(page.getByRole('heading',{level:1})).toContainText('ORCHID-7421');await expect(page.getByRole('link',{name:'下载 PPTX'})).toBeVisible();expect(errors).toEqual([]);
});
