import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { messagesResponse } from '../../shared/chat.js';
async function usage() { return (await readFile('.acceptance/phase7-usage.jsonl', 'utf8')).trim().split('\n').map(s => JSON.parse(s)); }
async function searchCalls() { return (await usage()).filter(r => r.event === 'reserve' && r.kind === 'search').length; }
// REAL browser/API, DB, Tavily, LLM; source snippets retained only in ignored acceptance directory.
test('REAL required/auto/off, sources, deduplication and browser history reload', async ({ page, request }) => {
  const created = await request.post('/api/conversations', { data: { title: 'Phase7 real search acceptance' } }); expect(created.status()).toBe(201);
  const id = (await created.json()).conversation.id;
  await page.addInitScript(value => localStorage.setItem('contextpilot.conversation', value), id); await page.goto('/');
  await expect(page.getByLabel('消息', { exact: true })).toBeEnabled();
  const evidence: unknown[] = [];
  for (const [mode, question, delta] of [
    ['required', 'Node.js latest LTS release official', 1],
    ['auto', '当前 TypeScript 最新稳定版本是什么？', 1],
    ['auto', '解释二分查找的基本原理。', 0],
    ['off', '今天的科技新闻有哪些？', 0],
  ] as const) {
    const before = await searchCalls();
    await page.getByLabel('联网搜索模式').selectOption(mode);
    await page.getByLabel('消息', { exact: true }).fill(question);
    const reply = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(`/conversations/${id}/messages`), { timeout: 120000 });
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    const response = await reply; expect(response.status()).toBe(200);
    const rows = messagesResponse.parse(await response.json()).messages; const answer = rows[1];
    expect(answer.status, answer.errorCode ?? '').toBe('completed'); expect(await searchCalls()).toBe(before + delta);
    if (delta) {
      expect(answer.webSources.length).toBeGreaterThan(0);
      for (const s of answer.webSources) { expect(s.summary).toContain(s.quote); expect(answer.content).toContain(s.quote); expect(Date.parse(s.queriedAt)).toBeGreaterThan(0); }
      const duplicate = await request.post(`/api/conversations/${id}/messages`, { data: { content: question, searchMode: mode, clientRequestId: rows[0].clientRequestId } });
      expect(duplicate.status()).toBe(200); expect(await searchCalls()).toBe(before + 1);
      evidence.push({ question, answer });
    } else expect(answer.webSources).toEqual([]);
    await expect(page.getByLabel('消息', { exact: true })).toBeEnabled({ timeout: 30000 });
  }
  await page.reload();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(4);
  const first = page.getByRole('article', { name: 'AI 消息' }).first();
  await expect(first).toContainText('网页 [W');
  await first.locator('details').first().locator('summary').click();
  await expect(first).toContainText('查询时间：');
  const links = await first.locator('a[target="_blank"]').evaluateAll(nodes => nodes.map(n => (n as HTMLAnchorElement).href));
  expect(links.length).toBeGreaterThan(0);
  const access: unknown[] = [];
  // Bounded public-source reads; no provider extraction API or credential forwarding.
  for (const url of links.slice(0, 3)) {
    try { const r = await request.get(url, { timeout: 20000, maxRedirects: 3 }); access.push({ url, status: r.status() }); } catch { access.push({ url, status: 'unreachable' }); }
  }
  expect(access.some(r => typeof (r as {status:unknown}).status === 'number' && ((r as {status:number}).status >= 200 && (r as {status:number}).status < 400))).toBe(true);
  await mkdir('.acceptance', { recursive: true });
  await writeFile('.acceptance/phase7-search-result.json', JSON.stringify({ conversationId: id, evidence, access }, null, 2));
  await page.screenshot({ path: 'test-results/phase7-real-search.png', fullPage: true });
});

test('RESTART restores persisted real-search references without new search', async ({ page, request }) => {
  const saved = JSON.parse(await readFile('.acceptance/phase7-search-result.json', 'utf8'));
  const before = await searchCalls();
  const response = await request.get(`/api/conversations/${saved.conversationId}/messages`);
  const rows = messagesResponse.parse(await response.json()).messages;
  expect(rows[1].webSources).toEqual(saved.evidence[0].answer.webSources);
  await page.addInitScript(value => localStorage.setItem('contextpilot.conversation', value), saved.conversationId); await page.goto('/');
  await expect(page.getByRole('article', { name: 'AI 消息' }).first()).toContainText(saved.evidence[0].answer.webSources[0].title);
  expect(await searchCalls()).toBe(before);
});

test('FINAL persisted real search retains all unique result metadata and selected quotes', async ({ request, page }) => {
  const before = await searchCalls();
  const list = await (await request.get('/api/conversations')).json();
  const id = list.conversations.find((c: { title: string }) => c.title === 'Phase7 final result snapshot')?.id;
  expect(id).toBeTruthy();
  const response = await request.get(`/api/conversations/${id}/messages`);
  const rows = messagesResponse.parse(await response.json()).messages; const answer = rows[1];
  expect(answer.status, answer.errorCode ?? '').toBe('completed');
  // A source may support several distinct exact quotations. Count result IDs, not quote cards.
  expect(new Set(answer.webSources.map(s => s.id)).size).toBe(5);
  for (const s of answer.webSources) { expect(s.title.length).toBeGreaterThan(0); expect(s.summary.length).toBeGreaterThan(0); if (s.quote) { expect(s.summary).toContain(s.quote); expect(answer.content).toContain(s.quote); } }
  expect(answer.webSources.some(s=>s.quote.length>0)).toBe(true);
  const history = messagesResponse.parse(await (await request.get(`/api/conversations/${id}/messages`)).json()).messages; expect(history[1].webSources).toEqual(answer.webSources);
  await page.addInitScript(value => localStorage.setItem('contextpilot.conversation', value), id); await page.goto('/');
  const first = page.getByRole('article', { name: 'AI 消息' }).first(); await expect(first.locator('details')).toHaveCount(answer.webSources.length); await expect(first).toContainText('已引用');
  if (answer.webSources.some(s=>!s.quote)) await expect(first).toContainText('仅检索');
  await page.reload(); await expect(page.getByRole('article', { name: 'AI 消息' }).first().locator('details')).toHaveCount(answer.webSources.length);
  expect(await searchCalls()).toBe(before);
  await writeFile('.acceptance/phase7-final-search-result.json', JSON.stringify({ conversationId: id, answer }, null, 2));
  await page.screenshot({path:'test-results/phase7-final-search.png',fullPage:true});
});
