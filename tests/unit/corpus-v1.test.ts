import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { cases } from '../corpus/v1/cases.js';
import { project, transcript, evidence, analysis, memoryText, web, searchQuestion, searchSelection, sources, plan, clock } from '../corpus/v1/materials.js';
import { buildContext } from '../../apps/api/src/chat/context.js';
import { parsePdf, chunkPages } from '../../apps/api/src/knowledge/pdf.js';
import { createKnowledgeAnswerer, verifyEvidence, insufficientEvidence } from '../../apps/api/src/knowledge/retrieval.js';
import { decodeTranscript, parseAnalysis, sameAction, taskKey } from '../../apps/api/src/meetings/analysis.js';
import { verifyMemories, fingerprint } from '../../apps/api/src/memory/extraction.js';
import { answerWithMemory } from '../../apps/api/src/memory/service.js';
import { answerWithSearch, needsSearch, publicQuery, createSearchProvider } from '../../apps/api/src/search/service.js';
import { searchIntent } from '../../apps/api/src/search/evidence.js';
import { verifyPlan, planPresentation } from '../../apps/api/src/presentations/plan.js';
import { officialWebSources } from '../../apps/api/src/presentations/evidence.js';
import { isPresentationIntent, parsePresentationRequest } from '../../apps/api/src/presentations/intent.js';
import { renderPresentation, validatePptx, assertTextFit } from '../../apps/api/src/presentations/render.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import type { ExtractedMemory, MemoryCitation } from '../../shared/memory.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const model = (value: unknown) => ({ complete: vi.fn(async () => ({ model: 'CORPUS_STUB_NO_PROVIDER', content: JSON.stringify(value) })) });
let parsed: Awaited<ReturnType<typeof parsePdf>>[];
let network: ReturnType<typeof vi.fn>;
beforeAll(async () => {
  network = vi.fn(() => { throw new Error('Corpus forbids outbound fetch'); });
  vi.stubGlobal('fetch', network);
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(clock));
  parsed = await Promise.all(project.pdfs.map(async path => parsePdf(await readFile(path))));
});
afterAll(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Corpus v1 — real validators/parsers/rendering with explicit external STUBs', () => {
  it('T01 manifest has eight stable cases and frozen conditions', () => {
    expect(cases.map(c => c.id)).toEqual(['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08']);
    for (const c of cases) { expect(c.config.clock).toBe(clock); expect(c.result).toBe('NOT_RUN'); }
    expect(cases.find(c => c.id === 'T02')!.expectedFacts).toMatchObject({ code: project.code, owner: project.owner });
    expect(cases.find(c => c.id === 'T04')!.expectedFacts).toMatchObject({ owner: analysis.actions[0].owner, dueDate: analysis.actions[0].dueDate, level: analysis.risks[0].level });
    expect(cases.find(c => c.id === 'T08')!.expectedFacts.pages).toEqual([5, 10]);
  });
  it('T01 golden input checksums match the reviewed baseline (never auto-update)', async () => {
    const hashes: Record<string, string> = JSON.parse(await readFile('tests/corpus/v1/SHA256.json', 'utf8'));
    expect(Object.keys(hashes)).toHaveLength(6);
    for (const [path, hash] of Object.entries(hashes)) {
      const bytes = await readFile(path);
      const canonical = path.endsWith('.pdf') ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
      expect(createHash('sha256').update(canonical).digest('hex'), `v1 golden changed: ${path}; review version/reason before updating`).toBe(hash);
    }
  });
  it('T01 preserves supplied multi-turn history, rejects incomplete messages; does not invent other-session context', () => {
    const sessionA = [{ role: 'user' as const, content: `${project.id}负责人是${project.owner}`, status: 'completed' },
      { role: 'assistant' as const, content: '已记录当前项目。', status: 'completed' },
      { role: 'user' as const, content: '这位负责人是谁？', status: 'completed' },
      { role: 'assistant' as const, content: '错误的苏州林岚', status: 'failed' }];
    const context = buildContext(sessionA);
    expect(context.slice(1).map(m => m.content)).toEqual(sessionA.slice(0, 3).map(m => m.content));
    expect(JSON.stringify(context)).not.toContain('苏州');
    expect(JSON.stringify(buildContext([{ role: 'user', content: 'ORCHID-FIN独立会话', status: 'completed' }]))).not.toContain(project.owner);
    // This verifies the context boundary, NOT database selection, refresh or restart.
  });
  it('T02 actual PDFs contain consistent project, scope, target, owner and page-specific facts', () => {
    expect(parsed[0][1].text).toContain(project.code); expect(parsed[0][1].page).toBe(2);
    expect(parsed[0][1].text).toContain(String(project.budget));
    expect(parsed[1][0].text).toContain(project.owner); expect(parsed[1][1].text).toContain(project.location);
    expect(parsed[2][0].text).toContain('chat, PDF Q&A, meeting tasks, memory, search and PPT');
    expect(parsed[2][1].text).toContain('2026-11-20');
    for (const pages of parsed) for (const chunk of chunkPages(pages)) expect(pages.find(p => p.page === chunk.page)!.text).toContain(chunk.text);
  });
  it('T02 server-owned PDF citations override model metadata and discard invented prose', async () => {
    const retrieved = [{ sourceId: uuid(1), documentId: uuid(2), filename: 'rag-project.pdf', page: 2, text: parsed[0][1].text, similarity: 1 }];
    const m = model({ answer: '上线已批准', citations: [{ sourceId: uuid(1), quote: project.code, filename: 'fake', page: 99 }] });
    const result = await createKnowledgeAnswerer(async () => retrieved).answer('访问码？', m);
    expect(result.sources).toMatchObject([{ documentId: uuid(2), filename: 'rag-project.pdf', page: 2, quote: project.code }]);
    expect(result.content).not.toContain('上线已批准');
  });
  it('T03 absent evidence refuses, even when retrieved PDF is available; fake citations rejected', async () => {
    const source = { sourceId: uuid(1), documentId: uuid(2), filename: 'rag-project.pdf', page: 2, text: parsed[0][1].text, similarity: 1 };
    for (const candidates of [[], [source]]) {
      const m = model({ citations: [] });
      const result = await createKnowledgeAnswerer(async () => candidates).answer('已批准的正式上线日期？', m);
      expect(result.content).toBe(insufficientEvidence); expect(result.sources).toEqual([]);
      if (!candidates.length) expect(m.complete).not.toHaveBeenCalled();
    }
    for (const citation of [{ sourceId: uuid(9), quote: project.code }, { sourceId: uuid(1), quote: '2026-11-27上线已批准' }])
      expect(() => verifyEvidence(JSON.stringify({ citations: [citation] }), [source])).toThrow();
  });
  it('T04 transcript, risk and actions retain original evidence; unknowns remain null', async () => {
    expect((await readFile('tests/corpus/v1/meeting.txt', 'utf8')).replace(/\r\n/g, '\n')).toBe(transcript + '\n');
    expect(decodeTranscript('meeting.txt', 'text/plain', Buffer.from(transcript))).toBe(transcript);
    const result = parseAnalysis(JSON.stringify(analysis), transcript);
    expect(result.risks[0]).toMatchObject({ level: 'high', evidence: [evidence(4)] });
    expect(result.actions).toMatchObject([{ owner: '周宁', dueDate: '2026-11-08', evidence: evidence(5) }, { owner: null, dueDate: null }]);
    expect(result.actions.some(a => a.task.includes('发送邮件'))).toBe(false);
    const invalid = structuredClone(analysis); invalid.actions[1].owner = 'CEO';
    expect(() => parseAnalysis(JSON.stringify(invalid), transcript)).toThrow('负责人');
    invalid.actions[1].owner = null; invalid.actions[1].dueDate = '2026-11-09';
    expect(() => parseAnalysis(JSON.stringify(invalid), transcript)).toThrow('日期');
  });
  it('T04 manual owner/date edits preserve action identity (DB overwrite protection remains separately gated)', () => {
    const original = analysis.actions[0], edited = { ...original, owner: '林岚', dueDate: '2026-11-09' };
    expect(sameAction(original, edited)).toBe(true); expect(taskKey(original)).toBe(taskKey(edited));
    expect(edited).toMatchObject({ owner: '林岚', dueDate: '2026-11-09' });
  });
  it('T05 verifies distinct same-name evidence, explicit date/place and rejects invented facts', async () => {
    const facts: ExtractedMemory[] = [
      { kind: 'person', content: '林岚', evidence: evidence(9) }, { kind: 'place', content: '南京', evidence: evidence(9) },
      { kind: 'time', content: '2026-11-06', evidence: evidence(9) }, { kind: 'decision', content: '保留2026-11-20试点目标', evidence: evidence(7) },
      { kind: 'person', content: '林岚', evidence: evidence(10) },
    ];
    expect(verifyMemories(facts, transcript)).toHaveLength(5);
    expect(fingerprint(facts[0])).not.toBe(fingerprint(facts[4]));
    expect(() => verifyMemories([{ ...facts[1], content: '北京' }], transcript)).toThrow();
    const candidate: MemoryCitation = { id: uuid(5), kind: 'place', content: '南京', sources: [{ sourceType: 'chat', sourceId: uuid(6), parentId: uuid(7), observedAt: clock, evidence: { quote: memoryText, startLine: 1, endLine: 1 } }] };
    const result = await answerWithMemory('新会话：ORCHID-7421林岚在哪里？', [], model({ memoryIds: [uuid(5)], answer: '苏州' }), [candidate]);
    expect(result.content).toContain('南京'); expect(result.content).not.toContain('苏州'); expect(result.memorySources).toEqual([candidate]);
    await expect(answerWithMemory('地点？', [], model({ memoryIds: [uuid(9)] }), [candidate])).rejects.toThrow();
  });
  it('T06 auto/required/off intent, public minimization and task-specific authority', () => {
    expect(needsSearch(searchQuestion, 'auto')).toBe(true); expect(needsSearch('什么是二分查找', 'auto')).toBe(false);
    expect(needsSearch('什么是二分查找', 'required')).toBe(true); expect(needsSearch(searchQuestion, 'off')).toBe(false);
    expect(searchIntent('Python当前版本 官方来源').domains).toEqual(['python.org']);
    expect(searchIntent('PostgreSQL当前版本 官方来源').domains).toEqual(['postgresql.org']);
    expect(searchIntent('未知机构 官方来源').domains).toEqual([]);
    expect(() => publicQuery('根据内部会议全文查找供应商，邮箱secret@example.invalid')).toThrow();
  });
  it('T06 fresh official evidence supports explicit conclusion; stale/fake authority cannot', async () => {
    const search = vi.fn(async () => web);
    const m = model(searchSelection); const result = await answerWithSearch(searchQuestion, { search }, m);
    expect(search).toHaveBeenCalledExactlyOnceWith(publicQuery(searchQuestion), { domains: ['nodejs.org'], asOf: clock.slice(0, 10) });
    expect(result.content.startsWith('结论（来源明确记载）：The latest Active LTS is Node.js v26.13.0.')).toBe(true);
    expect(result.content).toContain(clock); expect(result.content).toContain(web[1].url);
    const citation = result.webSources.find(s => s.id === 'W2')!;
    expect(citation.publishedAt).toBe('2026-11-04');
    expect(web[1].summary).toContain(citation.quote);
    expect(citation.quote).toContain('v26.13.0');
    for (const old of [web[0], { ...web[1], url: 'https://nodejs.org.evil.invalid/' }]) {
      const answer = await answerWithSearch(searchQuestion, { async search() { return [old]; } }, model({ status: 'supported', conclusion: { id: old.id, quote: old.summary }, citations: [{ id: old.id, quote: old.summary }] }));
      expect(answer.content).not.toContain('结论（来源明确记载）');
    }
  });
  it('T06 required failures, rate/quota failures and empty results never claim success (transport STUB)', async () => {
    const m = model(searchSelection);
    await expect(answerWithSearch(searchQuestion, null, m)).rejects.toMatchObject({ code: 'SEARCH_NOT_CONFIGURED' });
    for (const [status, code] of [[429, 'SEARCH_RATE_LIMITED'], [402, 'SEARCH_QUOTA_EXCEEDED'], [500, 'SEARCH_UPSTREAM_ERROR']] as const) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }));
      const provider = createSearchProvider(parseEnv({ TAVILY_API_KEY: 'corpus-placeholder' }), transport)!;
      await expect(answerWithSearch(searchQuestion, provider, m)).rejects.toMatchObject({ code });
      expect(transport).toHaveBeenCalledTimes(1);
    }
    expect((await answerWithSearch(searchQuestion, { async search() { return []; } }, m)).webSources).toEqual([]);
    expect(m.complete).not.toHaveBeenCalled();
  });
  it('T07 unapproved meeting proposal does not replace PDF target; provenance remains separate', () => {
    expect(parsed[2][1].text).toContain('2026-11-20');
    const result = parseAnalysis(JSON.stringify(analysis), transcript);
    expect(result.decisions).toHaveLength(1); expect(result.decisions[0].value).toContain('2026-11-20');
    expect(result.decisions[0].value).not.toContain('2026-11-27');
    expect(evidence(8).quote).toContain('尚未获批');
    // STUB selection contract; whether a real model distinguishes proposal/decision is Live NOT_RUN.
  });
  it('T07 conflicting fresh official versions refuse certainty and preserve both source quotes', async () => {
    const other = { ...web[1], id: 'W3', summary: 'The latest Active LTS is Node.js v24.0.0.' };
    const result = await answerWithSearch(searchQuestion, { async search() { return [web[1], other]; } }, model({ ...searchSelection, citations: [...searchSelection.citations, { id: 'W3', quote: other.summary }] }));
    expect(result.content.startsWith('来源存在冲突，无法确认')).toBe(true);
    expect(result.content).toContain('v26.13.0'); expect(result.content).toContain('v24.0.0'); expect(result.webSources).toHaveLength(2);
  });
  it.each([5, 10] as const)('T08 %i-page integrated planner/renderer with actual source validation; no real model/download', async count => {
    expect(isPresentationIntent('什么是PPT')).toBe(false);
    expect(parsePresentationRequest(`根据资料生成${count}页管理层汇报PPT`).pageCount).toBe(count);
    const p = plan(count);
    // Anchor snapshots back to actual parsed inputs rather than a self-consistent fabricated source list.
    expect(parsed[0][1].text).toContain(sources.find(s => s.id === 'P')!.text);
    expect(parsed[1][0].text).toContain(sources.find(s => s.id === 'O')!.text);
    expect(transcript).toContain(sources.find(s => s.id === 'M')!.text);
    expect(transcript).toContain(sources.find(s => s.id === 'L')!.text);
    expect(sources.find(s => s.id === 'T')).toMatchObject({ text: analysis.actions[0].task, owner: analysis.actions[0].owner, dueDate: analysis.actions[0].dueDate });
    const planned = await planPresentation(model({ content: p.slides.slice(1, -1).map(s => ({ items: s.items })) }), sources[0].text, count, sources, 8192);
    expect(planned.slides).toHaveLength(count);
    const { bytes, boxes } = await renderPresentation(planned, sources, '青禾科技 ORCHID-7421 管理汇报', new Date(clock));
    expect((await validatePptx(bytes, count)).slideCount).toBe(count); boxes.forEach(b => assertTextFit(b));
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const slideXml = (await Promise.all(Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map(n => zip.file(n)!.async('string')))).join('');
    for (const value of [project.code, project.owner, '周宁', '2026-11-08', 'Microsoft YaHei', '高', '南京']) expect(slideXml).toContain(value);
    expect(slideXml).not.toContain('2026-11-27上线已批准');
    const noteNames = Object.keys(zip.files).filter(n => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
    expect(noteNames).toHaveLength(count);
    const notes = (await Promise.all(noteNames.map(n => zip.file(n)!.async('string')))).join('');
    for (const value of [clock, web[1].url, 'documentId', 'todoVersion', 'observedAt', 'classification']) expect(notes).toContain(value);
    await mkdir('test-results/corpus-v1', { recursive: true });
    await writeFile(`test-results/corpus-v1/management-${count}.pptx`, bytes);
    await writeFile(`test-results/corpus-v1/management-${count}.json`, JSON.stringify({ count, sha256: createHash('sha256').update(bytes).digest('hex'), boxes, externalServices: 'STUB', download: 'NOT_RUN', nativeOpen: 'NOT_RUN' }, null, 2));
  });
  it('T08 official-only bypass, whole-quote integrity, unsupported claims and wrong counts are rejected', () => {
    const unofficial = { ...sources.at(-1)!, id: 'BAD', locator: { url: 'https://nodesource.com/' } };
    expect(officialWebSources([...sources, unofficial]).some(s => s.id === 'BAD')).toBe(false);
    for (const item of [{ kind: 'quote', sourceId: 'BAD', quote: unofficial.text }, { kind: 'analysis', sourceIds: ['BAD'], text: '需要核实' },
      { kind: 'quote', sourceId: 'P', quote: sources[1].text.slice(0, -8) }, { kind: 'quote', sourceId: 'P', quote: '项目已按期上线。' }]) {
      const p = plan(5); p.slides[1].items = [item as typeof p.slides[1]['items'][number]];
      expect(() => verifyPlan(p, 5, [...sources, unofficial])).toThrow();
    }
    expect(() => verifyPlan(plan(5), 10, sources)).toThrow();
    const p = plan(5); p.slides[1].items = [{ kind: 'analysis', text: '接口依赖可能影响联调，需要进一步核实', sourceIds: ['M'] }];
    expect(() => verifyPlan(p, 5, sources)).not.toThrow(); // faithful summaries do not need literal quote equality
  });
});
