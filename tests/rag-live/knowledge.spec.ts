import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { acceptanceFilename, recordAcceptance } from '../../scripts/acceptance-manifest.js';

// Real Storage, Embedding, PostgreSQL/pgvector and LLM. Requires explicit budget.
test('real PDF upload, multiple-document grounded answers, persistence and negative evidence', async ({ page, request }) => {
  await page.goto('/');
  for (const filename of ['rag-project.pdf', 'rag-owner.pdf']) {
    const uploadName = await acceptanceFilename(filename);
    const uploaded = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/documents?'));
    await page.getByLabel('上传 PDF', { exact: true }).setInputFiles({ name: uploadName, mimeType: 'application/pdf', buffer: await readFile(`tests/fixtures/${filename}`) });
    const response = await uploaded;
    expect(response.status()).toBe(202);
    const row = page.locator('.document-list li').filter({ hasText: uploadName });
    await expect(row).toBeVisible();
    const id = (await row.getAttribute('data-document-id'))!;
    await recordAcceptance('documents', id);
    await expect(page.locator(`[data-document-id="${id}"]`)).toContainText('可用于知识问答', { timeout: 90000 });
    const download = await request.get(`/api/documents/${id}/download`);
    expect(download.ok()).toBe(true);
    const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
    expect(hash(await download.body())).toBe(hash(await readFile(`tests/fixtures/${filename}`)));
  }
  const created = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/conversations'));
  const previousId = await page.evaluate(() => localStorage.getItem('contextpilot.conversation'));
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
  expect((await created).status()).toBe(201);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('contextpilot.conversation'))).not.toBe(previousId);
  const conversationId = (await page.evaluate(() => localStorage.getItem('contextpilot.conversation')))!;
  await recordAcceptance('conversations', conversationId);
  await expect(page.getByLabel('消息', { exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('contextpilot.conversation'))).toBe(conversationId);
  await page.getByRole('checkbox', { name: '使用 PDF 知识库' }).check();
  await page.getByLabel('消息', { exact: true }).fill('根据 PDF，ORCHID-7421 的 launch access code 和 owner 分别是什么？请给出两项原文证据。');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  const answer = page.getByRole('article', { name: 'AI 消息' }).last();
  await expect(answer).toContainText('AMBER-593', { timeout: 90000 });
  await expect(answer).toContainText('Mira Qiao');
  await expect(answer).toContainText('rag-project.pdf · 第 2 页');
  await expect(answer).toContainText('rag-owner.pdf · 第 1 页');
  await page.reload();
  await expect(page.getByRole('article', { name: 'AI 消息' }).last()).toContainText('AMBER-593');
  await page.getByRole('checkbox', { name: '使用 PDF 知识库' }).check();
  await page.getByLabel('消息', { exact: true }).fill('根据 PDF，ORCHID-7421 的保险合同编号是什么？');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByRole('article', { name: 'AI 消息' }).last()).toContainText('证据不足', { timeout: 90000 });
});

test('blank and damaged PDFs persist real failure status without publishing chunks', async ({ request }) => {
  for (const [name, bytes, code] of [
    ['blank-live.pdf', await readFile('tests/fixtures/rag-no-text.pdf'), 'PDF_NO_TEXT'],
    ['damaged-live.pdf', Buffer.from('%PDF-1.7 broken'), 'PDF_PARSE_FAILED'],
  ] as const) {
    const filename = await acceptanceFilename(name);
    const uploaded = await request.post(`/api/documents?filename=${encodeURIComponent(filename)}`, { headers: { 'content-type': 'application/pdf' }, data: bytes });
    expect(uploaded.status()).toBe(202);
    const id = (await uploaded.json()).document.id;
    await recordAcceptance('documents', id);
    await expect.poll(async () => (await (await request.get(`/api/documents/${id}`)).json()).document.status, { timeout: 60000 }).toBe('failed');
    const document = (await (await request.get(`/api/documents/${id}`)).json()).document;
    expect(document.errorCode).toBe(code);
    expect(document.chunkCount).toBe(0);
  }
});
