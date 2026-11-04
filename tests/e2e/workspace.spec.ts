import { expect, test } from '@playwright/test';

test('workspace displays health from the actual backend', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/health') && response.status() === 200);
  await page.goto('/');
  const response = await responsePromise;
  expect(await response.json()).toMatchObject({ service: 'contextpilot-api', database: 'not_configured' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('让上下文');
  await expect(page.getByRole('status')).toContainText('后端已连接');
  await expect(page.getByRole('status')).toContainText('数据库未配置');
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
});
