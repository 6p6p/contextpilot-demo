import { expect, test } from '@playwright/test';

test('workspace displays health from the actual backend', async ({ page }) => {
  let sessionChecks=0;
  // The authenticated parent owns session state. A redundant child probe must not
  // reintroduce a second PPT password when that extra request is unavailable.
  await page.route('**/api/demo-session',async route=>{
    if(route.request().method()==='GET'&&++sessionChecks>1)return route.fulfill({status:503,json:{error:{message:'synthetic session probe failure'}}});
    return route.continue();
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/health') && response.status() === 200);
  await page.goto('/');
  if(process.env.DEMO_ACCESS_KEY){
    await expect(page.getByLabel('Demo 访问口令')).toBeVisible();
    await expect(page.getByRole('heading',{name:'AI 决策助手'})).toHaveCount(0);
    await page.screenshot({path:'test-results/demo-login.png',fullPage:true});
    for(const [method,path] of [['GET','/api/conversations'],['GET','/api/presentations/00000000-0000-4000-8000-000000000001/download'],['POST','/api/documents'],['POST','/api/meetings'],['POST','/api/conversations/00000000-0000-4000-8000-000000000001/messages']]){
      const denied=await page.request.fetch(path,{method});expect(denied.status()).toBe(401);expect(denied.headers()['x-request-id']).toBeTruthy();
    }
    await page.getByLabel('Demo 访问口令').fill(process.env.DEMO_ACCESS_KEY);
    await page.getByRole('button',{name:'进入 Demo',exact:true}).click();
  }
  const response = await responsePromise;
  expect(await response.json()).toMatchObject({ service: 'contextpilot-api', database: 'not_configured' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('AI 决策助手');
  await expect(page.getByRole('status')).toContainText('后端已连接');
  await expect(page.getByRole('status')).toContainText('数据库未配置');
  await page.getByText('PPT 资料与下载 · 在聊天中明确输入').click();
  await expect(page.getByLabel('PPT 访问口令')).toHaveCount(0);await expect(page.getByRole('button',{name:'解锁 PPT',exact:true})).toHaveCount(0);
  if(process.env.DEMO_ACCESS_KEY)await expect(page.getByText('使用当前 Demo 登录，生成与私有下载无需再次验证。')).toBeVisible();
  await page.unroute('**/api/demo-session');
  await page.getByText('PPT 资料与下载 · 在聊天中明确输入').click();
  await expect(page.getByLabel('联网搜索模式')).toHaveValue('auto');
  await page.getByLabel('联网搜索模式').selectOption('off');
  await expect(page.getByLabel('联网搜索模式')).toHaveValue('off');
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '重新检查' }).click();
  await expect(page.getByRole('status')).toContainText('后端已连接');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true });
  if(process.env.DEMO_ACCESS_KEY){
    for(const [path,type,size] of [['/api/documents?filename=x.pdf','application/pdf',6*1024*1024+1],['/api/meetings?filename=x.txt','text/plain',1024*1024+1]] as const){
      const r=await page.request.post(path,{headers:{'content-type':type},data:Buffer.alloc(size)});expect(r.status()).toBe(413);
    }
    await page.goto('/interview');await expect(page.getByRole('heading',{level:1})).toContainText('AI 决策助手');
    await page.reload();await expect(page.getByRole('heading',{level:1})).toContainText('AI 决策助手');
    await page.getByRole('button',{name:'退出 Demo',exact:true}).click();await expect(page.getByLabel('Demo 访问口令')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    expect((await page.request.get('/api/conversations')).status()).toBe(401);
  }
});

test('completed meeting exposes draft entry and confirmation stays separate from sending (UI fixture)',async({page})=>{
  const id='00000000-0000-4000-8000-000000000091';
  let ignored=false;
  await page.route(`**/api/meeting-todos/${id}/ignore`,r=>{ignored=true;return r.fulfill({json:{id,retained:true}});});
  await page.route('**/api/meetings',r=>r.fulfill({json:{meetings:[{id,filename:'CORPUS UI meeting.txt',status:'ready'}]}}));
  await page.route(`**/api/meetings/${id}`,r=>r.fulfill({json:{
    meeting:{id,filename:'CORPUS UI meeting.txt',status:'ready',lineCount:1,requestedVersion:1,currentAnalysisId:id,errorCode:null,errorMessage:null},
    analysis:{id,version:1,model:'UI-STUB',result:{topic:null,meetingDate:null,location:null,participants:[],topics:[],decisions:[],risks:[],actions:[]}},
    versions:[{id,version:1}],risks:[],todos:[{id,analysisId:id,task:'确认接口',owner:null,dueDate:null,status:'open',version:ignored?2:1,origin:'meeting_action',ignored,evidence:{quote:'确认接口',startLine:1,endLine:1}}],draft:{id,analysisId:id,version:1,recipients:[],subject:'合成风险草稿',body:'人工复核，不发送。',state:'draft',deliveryState:'not_sent',stale:false}
  }}));
  await page.goto('/');
  if(process.env.DEMO_ACCESS_KEY){await page.getByLabel('Demo 访问口令').fill(process.env.DEMO_ACCESS_KEY);await page.getByRole('button',{name:'进入 Demo',exact:true}).click();}
  await page.getByRole('button',{name:'会议与待办',exact:true}).click();
  await page.getByRole('button',{name:'CORPUS UI meeting.txt · 分析完成'}).click();
  await page.getByRole('link',{name:'查看邮件草稿（确认不发送）'}).click();
  await expect(page.getByLabel('草稿主题')).toHaveValue('合成风险草稿');
  await expect(page.getByRole('button',{name:'确认此版本（不发送）'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'发送此版本…'})).toBeDisabled();
  await page.getByRole('button',{name:'忽略 / 移除待办'}).click();
  await page.getByRole('dialog',{name:'忽略待办'}).getByRole('button',{name:'确认',exact:true}).click();
  await expect(page.getByRole('button',{name:'恢复待办'})).toBeVisible();
  await expect(page.getByText('待办已忽略，历史证据仍保留')).toBeVisible();
});

test('chat Markdown, reading position, rename/archive confirmation and PDF removal (UI fixtures)',async({page})=>{
  const id='00000000-0000-4000-8000-000000000081',at='2026-11-06T08:00:00Z';
  const conversation={id,title:'合成项目会话',createdAt:at,updatedAt:at};let archived=false,removed=false;
  let delayRefresh=false,releaseRefresh!:()=>void;const refreshGate=new Promise<void>(resolve=>{releaseRefresh=resolve;});
  await page.route('**/api/memories',async r=>{if(delayRefresh)await refreshGate;return r.fulfill({json:{configured:true,memories:[],jobs:[]}});});
  await page.route('**/api/presentations',r=>r.fulfill({json:{presentations:[{id,assistantMessageId:id,conversationId:id,filename:'Fixture-report.pptx',pageCount:5,status:'ready',errorCode:null,errorMessage:null,retries:0,size:200,createdAt:at,updatedAt:at}]}}));
  const message={id,conversationId:id,clientRequestId:id,ordinal:0,role:'assistant',status:'completed',content:'# 管理摘要\n**重点**\n- 风险有依据\n> 来源待复核\n```js\n<script>evil()</script>\n```\n<img src=x onerror=evil()>\n[危险](javascript:evil)\n'+Array.from({length:45},(_,i)=>`第${i}段：保留真实来源和可追溯的项目事实。`).join('\n'),errorCode:null,model:'UI-STUB',createdAt:at,updatedAt:at};
  await page.route('**/api/conversations',r=>r.fulfill({json:{conversations:archived?[]:[conversation]}}));
  await page.route(`**/api/conversations/${id}/messages`,r=>r.fulfill({json:{messages:[message]}}));
  await page.route(`**/api/conversations/${id}`,r=>{if(r.request().method()==='PATCH')conversation.title=r.request().postDataJSON().title;else if(r.request().method()==='DELETE')archived=true;return r.fulfill({json:{id,retained:true}});});
  await page.route('**/api/documents',r=>r.fulfill({json:{documents:removed?[]:[{id,filename:'合成资料.pdf',size:200,status:'ready',pageCount:2,chunkCount:2,errorCode:null,errorMessage:null,createdAt:at,updatedAt:at}]}}));
  await page.route(`**/api/documents/${id}`,r=>{removed=true;return r.fulfill({json:{id,retained:true}});});
  await page.goto('/');if(process.env.DEMO_ACCESS_KEY){await page.getByLabel('Demo 访问口令').fill(process.env.DEMO_ACCESS_KEY);await page.getByRole('button',{name:'进入 Demo',exact:true}).click();}
  await expect(page.locator('.safe-markdown strong')).toHaveText('重点');await expect(page.locator('.safe-markdown pre code')).toHaveText('<script>evil()</script>');
  expect(await page.locator('.safe-markdown img,.safe-markdown script,.safe-markdown a[href^="javascript:"]').count()).toBe(0);
  const scroller=page.getByLabel('聊天消息');await expect.poll(()=>scroller.evaluate(e=>e.scrollTop)).toBeGreaterThan(100);
  await scroller.evaluate(e=>{e.scrollTop=15;e.dispatchEvent(new Event('scroll',{bubbles:true}));});
  const reloaded=page.waitForResponse(r=>r.url().endsWith(`/conversations/${id}/messages`));await page.getByRole('button',{name:'重新加载历史'}).click();await reloaded;
  await expect(scroller).toHaveAttribute('aria-busy','false');expect(await scroller.evaluate(e=>e.scrollTop)).toBeLessThan(100);
  await page.getByRole('button',{name:'重命名 合成项目会话'}).click();await page.getByLabel('会话名称').fill('更新的项目标题');await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();await expect(page.getByRole('button',{name:'重命名 更新的项目标题'})).toBeVisible();
  await page.getByRole('button',{name:'删除 更新的项目标题'}).click();await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();expect(archived).toBe(false);
  await page.screenshot({path:'test-results/chat-v2-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect.poll(async()=>{const box=await page.locator('#chat-input').boundingBox();return Boolean(box&&box.y+box.height<=844);}).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2)).toBe(true);await page.screenshot({path:'test-results/chat-v2-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'删除 更新的项目标题'}).click();await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();await expect(page.getByText('暂无会话，创建后开始对话。')).toBeVisible();
  await page.getByRole('button',{name:'知识库',exact:true}).click();await page.getByRole('button',{name:'移除文件',exact:true}).click();await page.getByRole('dialog',{name:'移除 PDF'}).getByRole('button',{name:'确认',exact:true}).click();await expect(page.getByText('尚无已上传文件。')).toBeVisible();
  await page.getByRole('button',{name:'长期记忆',exact:true}).click();delayRefresh=true;
  await page.getByRole('button',{name:'刷新记忆',exact:true}).click();await expect(page.getByRole('button',{name:'刷新中…'})).toBeDisabled();releaseRefresh();
  await expect(page.getByRole('button',{name:'刷新记忆',exact:true})).toBeEnabled();await expect(page.getByText(/^已刷新 /)).toBeVisible();
  await page.getByRole('button',{name:'PPT 文件',exact:true}).click();await expect(page.getByLabel('PPT 引用会议')).toBeVisible();await expect(page.getByRole('link',{name:'下载 PPTX'})).toHaveAttribute('href',`/api/presentations/${id}/download`);
  await page.reload();await page.getByRole('button',{name:'PPT 文件',exact:true}).click();await expect(page.getByRole('link',{name:'下载 PPTX'})).toBeVisible();await expect(page.getByLabel('PPT 访问口令')).toHaveCount(0);
});
