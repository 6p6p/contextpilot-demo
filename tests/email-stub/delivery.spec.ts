import { test, expect, type Page } from '@playwright/test';
async function open(page: Page, kind: string) {
  await page.goto('/'); await page.locator('.meeting-list button').filter({ hasText: `phase6-email-ui-${kind}-` }).first().click();
  await expect(page.getByLabel('草稿主题')).toHaveValue(`STUB-${kind}`, { timeout: 30000 });
}
async function confirm(page: Page) {
  await page.getByRole('button', { name: '确认此版本（不发送）' }).click();
  await expect(page.getByRole('button', { name: '发送此版本…' })).toBeEnabled({ timeout: 30000 });
  await page.getByRole('button', { name: '发送此版本…' }).click();
  await expect(page.getByRole('button', { name: '确认发送邮件', exact: true })).toBeDisabled();
  await page.getByLabel('我确认向以上收件人发送此版本').check();
  await page.getByRole('button', { name: '确认发送邮件', exact: true }).click();
}
test('STUB rejected send shows real API error, immutable preview and duplicate protection', async ({ page, request }) => {
  await open(page, 'reject'); await expect(page.getByRole('button', { name: '发送此版本…' })).toBeDisabled();
  await page.getByLabel('草稿正文').fill('User-edited frozen preview, no real email.');
  await page.getByRole('button', { name: '复核并保存草稿' }).click();
  await expect(page.getByRole('heading', { name: '邮件草稿 · v2' })).toBeVisible({ timeout: 30000 });
  await confirm(page); const panel = page.getByRole('region', { name: '邮件发送与历史' });
  await expect(panel).toContainText('STUB_PROVIDER_REJECTED', { timeout: 30000 });
  await expect(panel).toContainText('User-edited frozen preview');
  const record = panel.locator('[data-delivery-id]').first(); const id = await record.getAttribute('data-delivery-id');
  const draftId = (await (await request.get(`/api/meetings/${await page.locator('[data-selected-meeting]').getAttribute('data-selected-meeting')}`)).json()).draft.id;
  const repeat = await request.post(`/api/email-drafts/${draftId}/send`, { data: { version: 2, confirmSend: true } }); expect(repeat.status()).toBe(202); expect((await repeat.json()).delivery.id).toBe(id);
  const calls = await (await request.get('/api/test/email-calls')).json(); expect(calls[`contextpilot/email/${draftId}/v2`]).toBe(1);
});
test('STUB timeout displays unknown and blocks blind resend', async ({ page }) => {
  await open(page, 'timeout'); await confirm(page);
  const panel = page.getByRole('region', { name: '邮件发送与历史' }); await expect(panel).toContainText('EMAIL_PROVIDER_EXCEPTION', { timeout: 30000 }); await expect(panel).toContainText('禁止盲目重发'); await expect(page.getByRole('button', { name: '发送此版本…' })).toBeDisabled();
});
test('STUB accepted is separate from delivered, history survives browser reload', async ({ page }) => {
  await open(page, 'accepted'); await confirm(page); const panel = page.getByRole('region', { name: '邮件发送与历史' });
  await expect(panel).toContainText('供应商已接受（未确认投递）', { timeout: 30000 });
  await panel.getByRole('button', { name: '核查供应商状态（不重发）' }).click(); await expect(panel).toContainText('供应商报告已投递至对端邮件服务器', { timeout: 30000 });
  await page.reload(); await page.locator('.meeting-list button').filter({ hasText: 'phase6-email-ui-accepted-' }).first().click(); await expect(page.getByRole('region', { name: '邮件发送与历史' })).toContainText('供应商报告已投递至对端邮件服务器', { timeout: 30000 });
});

test('STUB HTTP rejection is shown without a send record for a non-allowlisted recipient', async ({ page }) => {
  await open(page, 'notallowed'); await page.getByLabel('草稿收件人').fill('outside@example.invalid'); await page.getByRole('button', { name: '复核并保存草稿' }).click(); await expect(page.getByRole('heading', { name: '邮件草稿 · v2' })).toBeVisible({ timeout: 30000 });
  await confirm(page); await expect(page.getByRole('region', { name: '邮件发送与历史' }).getByRole('alert')).toContainText('白名单', { timeout: 30000 });
  await expect(page.getByRole('region', { name: '邮件发送与历史' })).toContainText('尚无发送记录');
});
