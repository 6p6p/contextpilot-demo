// Files only. No dotenv, database or network. Preparing this does NOT authorize Stage B calls.
import { randomUUID } from 'node:crypto';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const runId = randomUUID(), directory = resolve('.acceptance/corpus-stage-b', runId);
await mkdir(directory, { recursive: true });
const pdfs = [];
for (const path of ['tests/fixtures/rag-project.pdf', 'tests/fixtures/rag-owner.pdf', 'tests/corpus/v1/project-brief.pdf']) {
  const target = resolve(directory, `CORPUS-LIVE-${runId}-${path.split('/').at(-1)}`);
  await copyFile(path, target); pdfs.push(target);
}
const meeting = resolve(directory, `CORPUS-LIVE-${runId}-meeting.txt`);
await writeFile(meeting, (await readFile('tests/corpus/v1/meeting.txt', 'utf8')).replace(/\r\n/g, '\n').trimEnd() + `\n合成验收Run ID：${runId}。\n`);
const inputs = {
  introduction: `本轮合成验收${runId}：ORCHID-7421项目总负责人是Dr. Mira Qiao，林岚于2026-11-06在南京协调试点准备；另一项目ORCHID-FIN的林岚负责财务，在苏州，时间2026-12-01。请记住这些明确事实，不能将同名人员合并。`,
  followUp: '刚才我提到的ORCHID-7421项目总负责人是谁？林岚的地点和时间是什么？',
  pdfExact: '请仅依据PDF原文说明ORCHID-7421的launch access code和owner，附文件名与物理页码。',
  pdfMissing: '请仅依据PDF说明ORCHID-7421已经批准的正式生产上线日期；没有依据请明确说明证据不足，不把试点目标当作上线批准。',
  recall: `请回忆本轮合成验收${runId}中，ORCHID-7421的林岚何时在哪里做什么？与ORCHID-FIN的同名林岚区分，并列出记忆来源。`,
  search: '请联网查询 Node.js 当前的 LTS 版本，并给出官方来源链接和查询时间。',
  ppt: `本轮合成验收${runId}：综合PDF中ORCHID-7421的launch access code和owner、所选会议风险及已人工编辑待办、跨会话记忆中ORCHID-7421林岚的地点和时间，以及最新公开Node.js LTS信息，生成10页综合管理汇报PPT，只引用Node.js官方网页来源；区分事实、分析和建议，未批准的改期不能当作决策。`,
  publicPptQuery: 'Node.js latest Active LTS official',
};
const manifest = { runId, stage: 'B_MANUAL', createdAt: new Date().toISOString(), status: 'PREPARED_WAITING_API_AUTHORIZATION', files: { pdfs, meeting }, inputs,
  createdDatabaseObjects: [], storageObjects: [], results: [], apiUsage: [], cleanupApproved: false, cleanupExecuted: false,
  recordFormat: { table: 'exact table', id: 'exact UUID from network response', parentIds: [], operation: 'created', observedAt: 'ISO time' },
  warning: 'Only enter IDs actually returned by this manual run. Do not adopt Stage A STUB rows or guess ownership from filenames.' };
await writeFile(resolve(directory, 'manual-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(resolve(directory, 'copy-inputs.txt'), Object.entries(inputs).map(([k, v]) => `=== ${k} ===\n${v}`).join('\n\n') + '\n');
console.log(JSON.stringify({ runId, prepared: true, pdfs: pdfs.length, meetingFiles: 1, externalCalls: 0 }));
