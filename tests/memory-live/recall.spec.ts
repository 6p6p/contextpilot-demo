import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { messagesResponse } from '../../shared/chat.js';
test('RECALL real LLM recalls persisted chat and meeting in a fresh conversation', async ({ request }) => {
  const saved = JSON.parse(await readFile('.acceptance/phase5-memory-result.json', 'utf8'));
  const old = messagesResponse.parse(await (await request.get(`/api/conversations/${saved.source}/messages`)).json()).messages;
  const marker = old.find(m => m.id === saved.sourceMessageId)!.content.match(/星桥[a-f0-9]+/)![0];
  const meeting = await (await request.get(`/api/meetings/${saved.meetingId}/transcript`)).json();
  const meetingMarker = meeting.transcript.match(/海桥[a-f0-9]+/)[0];
  const created = await request.post('/api/conversations', { data: { title: 'Phase5-restarted-recall' } }); expect(created.status()).toBe(201);
  const id = (await created.json()).conversation.id;
  async function send(content: string) {
    const r = await request.post(`/api/conversations/${id}/messages`, { data: { content, clientRequestId: randomUUID() }, timeout: 180000 }); expect(r.status()).toBe(200);
    const rows = messagesResponse.parse(await r.json()).messages; expect(rows[1].status).toBe('completed'); return rows[1];
  }
  const chatAnswer = await send(`${marker}项目谁负责、在哪里？原定和调整后的试点日期是什么？`);
  for (const value of ['林岚','南京','11月5日','11月8日']) expect(chatAnswer.content).toContain(value);
  expect(chatAnswer.memorySources.some(m => m.sources.some(s => s.sourceId === saved.sourceMessageId))).toBe(true);
  const meetingAnswer = await send(`${meetingMarker}会议决定了什么，地点在哪里？`);
  expect(meetingAnswer.content).toContain('苏州'); expect(meetingAnswer.content).toContain('试点'); expect(meetingAnswer.memorySources.some(m => m.sources.some(s => s.parentId === saved.meetingId))).toBe(true);
});
