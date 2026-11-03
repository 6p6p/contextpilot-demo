import { expect, test } from '@playwright/test';
import { recordAcceptance } from '../../scripts/acceptance-manifest.js';

// REAL DB + REAL MODEL: gated by RUN_LIVE_TESTS in scripts/e2e.mjs.
// Creates retained acceptance records; does not delete user data.
test('real multi-turn chat survives reload and conversation switching', async ({ page }) => {
  const marker = `CP${Date.now()}`;
  await page.goto('/');
  const created = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/conversations'));
  const previousId = await page.evaluate(() => localStorage.getItem('contextpilot.conversation'));
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
  expect((await created).status()).toBe(201);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('contextpilot.conversation'))).not.toBe(previousId);
  const createdId = (await page.evaluate(() => localStorage.getItem('contextpilot.conversation')))!;
  await recordAcceptance('conversations', createdId);
  await expect(page.getByLabel('消息', { exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('contextpilot.conversation'))).toBe(createdId);
  await page.getByLabel('消息', { exact: true }).fill(`请记住本次对话的代号是${marker}。请用一句话确认。`);
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByLabel('消息', { exact: true })).toBeEnabled({ timeout: 65000 });
  await expect(page.getByRole('article', { name: 'AI 消息' }).last()).toContainText(marker, { timeout: 65000 });
  await page.getByLabel('消息', { exact: true }).fill('刚才我告诉你的代号是什么？请原样回答代号。');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByLabel('消息', { exact: true })).toBeEnabled({ timeout: 65000 });
  await expect(page.getByRole('article', { name: 'AI 消息' })).toHaveCount(2);
  await expect(page.getByRole('article', { name: 'AI 消息' }).last()).toContainText(marker, { timeout: 65000 });
  await page.reload();
  await expect(page.getByRole('article', { name: 'AI 消息' })).toHaveCount(2);
  await expect(page.getByRole('article', { name: 'AI 消息' }).last()).toContainText(marker);
  const nextCreated = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/conversations'));
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
  expect((await nextCreated).status()).toBe(201);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('contextpilot.conversation'))).not.toBe(createdId);
  const nextId = (await page.evaluate(() => localStorage.getItem('contextpilot.conversation')))!;
  await recordAcceptance('conversations', nextId);
  await expect(page.getByLabel('消息', { exact: true })).toBeEnabled();
  await expect(page.getByRole('article', { name: '用户消息' })).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(marker) }).click();
  await expect(page.getByRole('article', { name: 'AI 消息' })).toHaveCount(2);
  await expect(page.getByRole('article', { name: 'AI 消息' }).last()).toContainText(marker);
});
