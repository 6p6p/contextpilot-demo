import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { memoryListSchema } from '../../shared/memory.js';
import { messagesResponse } from '../../shared/chat.js';
// Run in a SECOND e2e.mjs invocation after memory.spec.ts; no model calls.
test('RESTART retains real-service memory and cited answers in a new server process', async ({ request, page }) => {
  const saved = JSON.parse(await readFile('.acceptance/phase5-memory-result.json', 'utf8'));
  const memory = memoryListSchema.parse(await (await request.get('/api/memories')).json());
  for (const id of saved.memoryIds) expect(memory.memories.some(m => m.id === id)).toBe(true);
  const rows = messagesResponse.parse(await (await request.get(`/api/conversations/${saved.next}/messages`)).json()).messages;
  expect(rows.at(-1)!.content).toBe(saved.answer); expect(rows.at(-1)!.memorySources.length).toBeGreaterThan(0);
  await page.addInitScript(id => localStorage.setItem('contextpilot.conversation', id), saved.next); await page.goto('/');
  await expect(page.getByRole('article', { name: 'AI 消息' }).last()).toContainText(saved.answer, { timeout: 30000 });
  await expect(page.getByRole('region', { name: '长期记忆' })).toContainText('提取服务已配置', { timeout: 30000 });
});

test('PERSISTED audits actual provider chat/meeting answers and unknown facts without repeating paid requests', async ({ request }) => {
  const saved = JSON.parse(await readFile('.acceptance/phase5-memory-result.json', 'utf8'));
  const memory = memoryListSchema.parse(await (await request.get('/api/memories')).json());
  const sourceFacts = memory.memories.filter(m => m.sources.some(s => s.sourceId === saved.sourceMessageId));
  for (const kind of ['person','place','topic','time']) expect(sourceFacts.some(m => m.kind === kind)).toBe(true);
  expect(sourceFacts.some(m => m.content.includes('2026'))).toBe(false);
  const history = messagesResponse.parse(await (await request.get(`/api/conversations/${saved.next}/messages`)).json()).messages;
  const answer = history.find(m => m.role === 'assistant')!;
  for (const expected of ['林岚','南京','11月5日','11月8日']) expect(answer.content).toContain(expected);
  expect(answer.memorySources.some(m => m.sources.some(s => s.sourceId === saved.sourceMessageId))).toBe(true);
  expect(saved.next).not.toBe(saved.source);
  const meetingHistory = messagesResponse.parse(await (await request.get(`/api/conversations/${saved.third}/messages`)).json()).messages;
  const meetingAnswer = meetingHistory.find(m => m.role === 'assistant')!;
  expect(meetingAnswer.content).toContain('苏州'); expect(meetingAnswer.content).toContain('试点');
  expect(meetingAnswer.memorySources.some(m => m.sources.some(s => s.parentId === saved.meetingId))).toBe(true);
  expect(meetingHistory.at(-1)!.content).toMatch(/没有|无法|未知|不确定|未提供/);
});
