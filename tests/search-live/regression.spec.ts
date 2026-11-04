import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { messagesResponse } from '../../shared/chat.js';
// Real APIs and fresh synthetic facts; no production/private transcript is used as test input.
test('REAL chat, PDF RAG, meeting and cross-conversation memory regression', async ({ request, page }) => {
  const marker = `青杉${randomUUID().slice(0, 8)}`;
  async function create() { const r = await request.post('/api/conversations', { data: { title: `Phase7 regression ${marker}` } }); expect(r.status()).toBe(201); return (await r.json()).conversation.id; }
  async function send(id: string, content: string, knowledgeMode = false) {
    const r = await request.post(`/api/conversations/${id}/messages`, { data: { content, knowledgeMode, searchMode: 'off', clientRequestId: randomUUID() }, timeout: 180000 }); expect(r.status()).toBe(200);
    const rows = messagesResponse.parse(await r.json()).messages; expect(rows[1].status, rows[1].errorCode ?? '').toBe('completed'); return rows;
  }
  const source = await create();
  const fact = await send(source, `事实记录：${marker}的负责人是林岚，地点是南京。请简短确认。`);
  expect(fact[1].content).toContain('林岚');
  await expect.poll(async () => {
    const body = await (await request.get('/api/memories')).json(); const job = body.jobs.find((j: { sourceId: string }) => j.sourceId === fact[0].id);
    if (job?.status === 'failed') throw new Error(`Extraction failed: ${job.errorCode}`); return job?.status;
  }, { timeout: 120000, intervals: [2000] }).toBe('ready');
  const next = await create(); const recalled = await send(next, `${marker}的负责人是谁，地点在哪里？`);
  expect(recalled[1].content).toContain('林岚'); expect(recalled[1].content).toContain('南京');
  expect(recalled[1].memorySources.some(m => m.sources.some(s => s.sourceId === fact[0].id))).toBe(true);
  await page.addInitScript(value => localStorage.setItem('contextpilot.conversation', value), next); await page.goto('/');
  await expect(page.getByRole('article', { name: 'AI 消息' }).last()).toContainText('本回答使用以下历史记忆：');
  await page.reload(); await expect(page.getByRole('article', { name: 'AI 消息' }).last()).toContainText('林岚');
  for (const filename of ['rag-project.pdf', 'rag-owner.pdf']) {
    const upload = await request.post(`/api/documents?filename=${encodeURIComponent(`phase7-${marker}-${filename}`)}`, { headers: { 'content-type': 'application/pdf' }, data: await readFile(`tests/fixtures/${filename}`) }); expect(upload.status()).toBe(202);
    const document = (await upload.json()).document;
    await expect.poll(async () => { const d = (await (await request.get(`/api/documents/${document.id}`)).json()).document; if (d.status === 'failed') throw new Error(`PDF failed ${d.errorCode}`); return d.status; }, { timeout: 120000, intervals: [2000] }).toBe('ready');
  }
  const pdf = await send(next, '根据 PDF，ORCHID-7421 的 launch access code 和 owner 分别是什么？请给出两项原文证据。', true);
  expect(pdf[1].content).toContain('AMBER-593'); expect(pdf[1].content).toContain('Mira Qiao'); expect(pdf[1].sources.length).toBeGreaterThan(0); expect(pdf[1].webSources).toEqual([]);
  const text = `主题：${marker}资料校对会\n参会人员：周宁\n周宁确认拼写复核已完成，无新增事项，无阻塞，无需后续行动。\n会议未提供日期和地点。`;
  const uploaded = await request.post(`/api/meetings?filename=phase7-${marker}.txt`, { headers: { 'content-type': 'text/plain' }, data: Buffer.from(text) }); expect(uploaded.status()).toBe(202);
  const meetingId = (await uploaded.json()).meeting.id;
  await expect.poll(async () => { const d = await (await request.get(`/api/meetings/${meetingId}`)).json(); if (d.meeting.status === 'failed') throw new Error(`Meeting failed ${d.meeting.errorCode}`); return d.meeting.status; }, { timeout: 180000, intervals: [2000] }).toBe('ready');
  const meeting = await (await request.get(`/api/meetings/${meetingId}`)).json();
  expect(meeting.risks).toEqual([]); expect(meeting.draft).toBeNull();
  await writeFile('.acceptance/phase7-regression-result.json', JSON.stringify({ source, next, sourceMessageId: fact[0].id, recallMessageId: recalled[1].id, pdfMessageId: pdf[1].id, meetingId, riskCount: meeting.risks.length, draftState: meeting.draft?.deliveryState ?? 'no_draft' }));
});

// Audit already-generated real-provider records after restart; no new business API calls.
test('PERSISTED real chat/RAG/meeting/memory regression evidence', async ({ request, page }) => {
  const saved = JSON.parse(await readFile('.acceptance/phase7-regression-result.json', 'utf8'));
  const source = messagesResponse.parse(await (await request.get(`/api/conversations/${saved.source}/messages`)).json()).messages;
  expect(source[1].status).toBe('completed'); expect(source[1].content).toContain('林岚');
  const rows = messagesResponse.parse(await (await request.get(`/api/conversations/${saved.next}/messages`)).json()).messages;
  const recall = rows.find(m => m.id === saved.recallMessageId)!;
  expect(recall.status).toBe('completed'); expect(recall.content).toContain('林岚'); expect(recall.content).toContain('南京');
  expect(recall.memorySources.some(m => m.sources.some(s => s.sourceId === saved.sourceMessageId))).toBe(true);
  const pdf = rows.find(m => m.id === saved.pdfMessageId)!; expect(pdf.status).toBe('completed');
  expect(pdf.content).toContain('AMBER-593'); expect(pdf.content).toContain('Mira Qiao'); expect(pdf.sources.length).toBeGreaterThan(0); expect(pdf.webSources).toEqual([]);
  const meeting = await (await request.get(`/api/meetings/${saved.meetingId}`)).json(); expect(meeting.meeting.status).toBe('ready'); expect(meeting.risks).toEqual([]); expect(meeting.draft).toBeNull();
  await page.addInitScript(value => localStorage.setItem('contextpilot.conversation', value), saved.next); await page.goto('/');
  await expect(page.getByRole('article', { name: 'AI 消息' }).first()).toContainText('林岚');
  await expect(page.getByRole('article', { name: 'AI 消息' }).last()).toContainText('AMBER-593');
});
