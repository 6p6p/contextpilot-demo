import { expect, test } from '@playwright/test';

test('workspace displays health from the actual backend', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/health') && response.status() === 200);
  await page.goto('/');
  if(process.env.DEMO_ACCESS_KEY){
    await expect(page.getByLabel('Demo 访问口令')).toBeVisible();
    await expect(page.getByRole('heading',{name:'让上下文，成为决策的起点。'})).toHaveCount(0);
    await page.screenshot({path:'test-results/demo-login.png',fullPage:true});
    for(const [method,path] of [['GET','/api/conversations'],['GET','/api/presentations/00000000-0000-4000-8000-000000000001/download'],['POST','/api/documents'],['POST','/api/meetings'],['POST','/api/conversations/00000000-0000-4000-8000-000000000001/messages']]){
      const denied=await page.request.fetch(path,{method});expect(denied.status()).toBe(401);expect(denied.headers()['x-request-id']).toBeTruthy();
    }
    await page.getByLabel('Demo 访问口令').fill(process.env.DEMO_ACCESS_KEY);
    await page.getByRole('button',{name:'进入 Demo',exact:true}).click();
  }
  const response = await responsePromise;
  expect(await response.json()).toMatchObject({ service: 'contextpilot-api', database: 'not_configured' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('让上下文');
  await expect(page.getByRole('status')).toContainText('后端已连接');
  await expect(page.getByRole('status')).toContainText('数据库未配置');
  await page.getByText('PPT 资料与下载 · 在聊天中明确输入').click();
  if(process.env.DEMO_ACCESS_KEY)await expect(page.getByText('PPT 使用当前 Demo 访问权限。')).toBeVisible();
  else {await expect(page.getByLabel('PPT 访问口令')).toBeVisible();await expect(page.getByRole('button', {name:'解锁 PPT',exact:true})).toBeDisabled();}
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
    await page.goto('/interview');await expect(page.getByRole('heading',{level:1})).toContainText('让上下文');
    await page.reload();await expect(page.getByRole('heading',{level:1})).toContainText('让上下文');
    await page.getByRole('button',{name:'退出 Demo',exact:true}).click();await expect(page.getByLabel('Demo 访问口令')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    expect((await page.request.get('/api/conversations')).status()).toBe(401);
  }
});
