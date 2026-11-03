import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { memoryListSchema } from '../../shared/memory.js';
import { messagesResponse } from '../../shared/chat.js';
const run = randomUUID().slice(0, 8);
async function create(request: APIRequestContext) { const r = await request.post('/api/conversations', { data: { title: `Memory-${run}` } }); expect(r.status()).toBe(201); return (await r.json()).conversation.id as string; }
async function send(request: APIRequestContext, id: string, content: string) {
  const r = await request.post(`/api/conversations/${id}/messages`, { data: { content, clientRequestId: randomUUID() }, timeout: 180000 });
  expect(r.status()).toBe(200); const rows = messagesResponse.parse(await r.json()).messages; expect(rows[1].status).toBe('completed');
  await expect.poll(async () => { const m = memoryListSchema.parse(await (await request.get('/api/memories')).json()); const j = m.jobs.find(j => j.sourceId === rows[0].id); if (j?.status === 'failed') throw new Error(`Memory failed: ${j.errorCode}`); return j?.status; }, { timeout: 120000, intervals: [2000] }).toBe('ready');
  return rows;
}
test('REAL chat/meeting memory, new conversations, conflict provenance, unknown and UI reload', async ({ request, page }) => {
  const source = await create(request);
  const marker = `星桥${run}`;
  const rows = await send(request, source, `事实记录：林岚负责${marker}项目，地点是南京。试点原定11月5日，后来决定改为11月8日，年份尚未确定。`);
  let memory = memoryListSchema.parse(await (await request.get('/api/memories')).json());
  const facts = memory.memories.filter(m => m.sources.some(s => s.sourceId === rows[0].id));
  for (const kind of ['person', 'place', 'topic', 'time']) expect(facts.some(m => m.kind === kind)).toBe(true);
  expect(facts.some(m => m.content.includes('2026'))).toBe(false);
  const next = await create(request);
  const answer = await send(request, next, `${marker}项目由谁负责、在哪里？原定和调整后的试点时间是什么？请保留日期冲突和未知年份。`);
  expect(answer[1].content).toContain('林岚'); expect(answer[1].content).toContain('南京'); expect(answer[1].content).toContain('11月5日'); expect(answer[1].content).toContain('11月8日');
  expect(answer[1].memorySources.some(m => m.sources.some(s => s.sourceId === rows[0].id))).toBe(true);
  const meetingText = `会议主题：海桥${run}试点。\n参会人：周宁。\n地点：苏州。\n关键决策：决定先开展海桥${run}小范围试点。\n行动：周宁整理海桥${run}试点清单。\n日期和截止时间未确定。`;
  const uploaded = await request.post(`/api/meetings?filename=memory-${run}.txt`, { headers: { 'content-type': 'text/plain' }, data: Buffer.from(meetingText) }); expect(uploaded.status()).toBe(202);
  const meetingId = (await uploaded.json()).meeting.id;
  let analysisId = '';
  await expect.poll(async () => { const detail = await (await request.get(`/api/meetings/${meetingId}`)).json(); if (detail.meeting.status === 'failed') throw new Error(`Meeting failed: ${detail.meeting.errorCode}`); analysisId = detail.meeting.currentAnalysisId; return detail.meeting.status; }, { timeout: 180000, intervals: [2000] }).toBe('ready');
  await expect.poll(async () => { memory = memoryListSchema.parse(await (await request.get('/api/memories')).json()); return memory.jobs.find(j => j.sourceId === analysisId)?.status; }, { timeout: 120000, intervals: [2000] }).toBe('ready');
  const third = await create(request);
  const meetingAnswer = await send(request, third, `海桥${run}会议做了什么关键决策，地点在哪里？`);
  expect(meetingAnswer[1].content).toContain('苏州'); expect(meetingAnswer[1].content).toContain('试点'); expect(meetingAnswer[1].memorySources.some(m => m.sources.some(s => s.parentId === meetingId))).toBe(true);
  const missing = await send(request, third, `海桥${run}项目的银行账号和林岚出生年份是什么？没有依据请明确说明未知。`);
  expect(missing[1].content).toMatch(/没有|无法|未知|不确定|未提供/);
  await mkdir('.acceptance', { recursive: true });
  await writeFile('.acceptance/phase5-memory-result.json', JSON.stringify({ run, source, next, third, meetingId, analysisId, sourceMessageId: rows[0].id, memoryIds: facts.map(m => m.id), answer: answer[1].content, meetingAnswer: meetingAnswer[1].content }));
  await page.addInitScript(id => localStorage.setItem('contextpilot.conversation', id), next); await page.goto('/');
  await expect(page.getByRole('article', { name: 'AI 消息' }).last()).toContainText('林岚', { timeout: 30000 });
  await expect(page.getByRole('region', { name: '长期记忆' })).toContainText('提取服务已配置', { timeout: 30000 });
  await expect(page.getByRole('article', { name: 'AI 消息' }).last().getByText('本回答使用以下历史记忆：')).toBeVisible();

});
