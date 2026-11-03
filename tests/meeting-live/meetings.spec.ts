import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { longMeetingFixture } from '../../scripts/meeting-fixtures.js';
import { meetingDetailSchema } from '../../shared/meetings.js';

const runId = randomUUID();
const created: string[] = [];
async function record(id: string) { created.push(id); await mkdir('.acceptance', { recursive: true }); await writeFile(`.acceptance/phase4-meetings-${runId}.json`, JSON.stringify({ runId, meetings: created })); }
async function waitReady(request: APIRequestContext, id: string) {
  await expect.poll(async () => {
    const detail = meetingDetailSchema.parse(await (await request.get(`/api/meetings/${id}`)).json());
    if (detail.meeting.status === 'failed') throw new Error(`Meeting failed: ${detail.meeting.errorCode}`);
    return detail.meeting.status;
  }, { timeout: 300000, intervals: [1500] }).toBe('ready');
  return meetingDetailSchema.parse(await (await request.get(`/api/meetings/${id}`)).json());
}
async function upload(request: APIRequestContext, name: string, text: string) {
  const response = await request.post(`/api/meetings?filename=${encodeURIComponent(`acceptance-${runId}-${name}`)}`, { headers: { 'content-type': 'text/plain; charset=utf-8' }, data: Buffer.from(text) });
  expect(response.status()).toBe(202);
  const body = await response.json(); await record(body.meeting.id);
  return body;
}
test('real risky meeting, evidence, manual edits, deduplication and draft-only confirmation', async ({ page, request }) => {
  const filename = `acceptance-${runId}-risk.txt`;
  const text = `${await readFile('tests/fixtures/meeting-risk.txt', 'utf8')}\n验收标识 ${runId}-risk`;
  await page.goto('/');
  await page.getByLabel('上传会议 TXT', { exact: true }).setInputFiles({ name: filename, mimeType: 'text/plain', buffer: Buffer.from(text) });
  const button = page.locator('.meeting-list button').filter({ hasText: filename });
  await expect(button).toBeVisible();
  const id = (await button.getAttribute('data-meeting-id'))!; await record(id);
  const initial = await waitReady(request, id);
  expect(initial.risks.length).toBeGreaterThanOrEqual(2);
  for (const risk of initial.risks) for (const evidence of risk.evidence) expect(text.replace(/\r\n/g, '\n').split('\n').slice(evidence.startLine - 1, evidence.endLine).join('\n')).toContain(evidence.quote);
  const unknown = initial.todos.find(t => t.origin === 'meeting_action' && t.task.includes('回款风险台账'));
  expect(unknown).toMatchObject({ owner: null, dueDate: null });
  const todo = initial.todos.find(t => t.origin === 'meeting_action' && t.task.includes('供应商'))!;
  expect(todo).toBeTruthy();
  await expect(page.locator(`[data-todo-id="${todo.id}"]`)).toBeVisible({ timeout: 20000 });
  const box = page.locator(`[data-todo-id="${todo.id}"]`);
  await box.getByLabel('待办负责人').fill('人工审查人'); await box.getByLabel('待办截止日期').fill('2026-11-08'); await box.getByLabel('待办处理状态').selectOption('in_progress'); await box.getByRole('button', { name: '保存待办' }).click();
  await expect.poll(async () => (await (await request.get(`/api/meetings/${id}`)).json()).todos.find((t: { id: string }) => t.id === todo.id).owner).toBe('人工审查人');
  await expect(page.getByLabel('草稿收件人')).toHaveValue('');
  await page.getByLabel('草稿收件人').fill('reviewer@example.invalid'); await page.getByLabel('草稿主题').fill('人工复核后的风险跟进');
  await page.getByRole('button', { name: '复核并保存草稿' }).click();
  await expect(page.getByRole('button', { name: '确认此版本（不发送）' })).toBeEnabled();
  await page.getByRole('button', { name: '确认此版本（不发送）' }).click();
  await expect(page.getByRole('region', { name: '会议邮件草稿' })).toContainText('此版本已确认，未发送');
  const duplicate = await upload(request, 'duplicate.txt', text);
  expect(duplicate.duplicate).toBe(true); expect(duplicate.meeting.id).toBe(id);
  const before = meetingDetailSchema.parse(await (await request.get(`/api/meetings/${id}`)).json());
  expect(before.versions).toHaveLength(1);
  const reanalyze = await request.post(`/api/meetings/${id}/reanalyze`); expect(reanalyze.status()).toBe(202);
  const after = await waitReady(request, id);
  expect(after.versions).toHaveLength(2);
  expect(after.todos).toHaveLength(before.todos.length);
  expect(after.todos.find(t => t.id === todo.id)).toMatchObject({ owner: '人工审查人', dueDate: '2026-11-08', status: 'in_progress' });
  expect(after.draft).toMatchObject({ subject: '人工复核后的风险跟进', deliveryState: 'not_sent', stale: true });
  await page.reload(); await page.locator('.meeting-list button').filter({ hasText: filename }).click();
  await expect(page.getByLabel('草稿主题')).toHaveValue('人工复核后的风险跟进');
});
test('real no-risk and missing-information/injection meetings', async ({ request }) => {
  for (const name of ['meeting-safe.txt', 'meeting-unknown-injection.txt']) {
    const text = `${await readFile(`tests/fixtures/${name}`, 'utf8')}\n验收标识 ${runId}-${name}`;
    const uploaded = await upload(request, name, text);
    const detail = await waitReady(request, uploaded.meeting.id);
    expect(detail.analysis!.result.meetingDate).toBeNull(); expect(detail.analysis!.result.location).toBeNull();
    if (name === 'meeting-safe.txt') { expect(detail.risks).toHaveLength(0); expect(detail.draft).toBeNull(); }
    else { expect(detail.risks.length).toBeGreaterThan(0); for (const todo of detail.todos) { expect(todo.owner).toBeNull(); expect(todo.dueDate).toBeNull(); expect(todo.task).not.toContain('steal@example.invalid'); } expect(detail.draft!.recipients).toEqual([]); expect(detail.draft!.deliveryState).toBe('not_sent'); }
  }
});
test('real long meeting connects first and final segment conditions', async ({ request }) => {
  const text = `${longMeetingFixture()}\n验收标识 ${runId}-long`;
  const uploaded = await upload(request, 'long.txt', text);
  const detail = await waitReady(request, uploaded.meeting.id);
  expect(detail.analysis!.result.meetingDate).toBeNull();
  for (const todo of detail.todos) { expect(todo.owner).toBeNull(); expect(todo.dueDate).toBeNull(); }
  expect(detail.risks.length).toBeGreaterThan(0);
  const lastCondition = text.split('\n').findIndex(line => line.startsWith('客户上线约束：')) + 1;
  expect(detail.risks.some(r => r.evidence.some(e => e.startLine <= 2 && e.endLine >= 2) && r.evidence.some(e => e.startLine <= lastCondition && e.endLine >= lastCondition))).toBe(true);
  expect(detail.todos.some(t => t.task.includes('协调供应商与客户'))).toBe(true);
});
