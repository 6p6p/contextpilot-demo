import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { analyzeTranscript, decodeTranscript, explicitDates, parseAnalysis, sameAction, segmentTranscript, taskKey } from '../../apps/api/src/meetings/analysis.js';
import type { MeetingAnalysis } from '../../shared/meetings.js';
import { longMeetingFixture } from '../../scripts/meeting-fixtures.js';

export const emptyAnalysis = (): MeetingAnalysis => ({ topic: null, meetingDate: null, location: null, participants: [], topics: [], decisions: [], risks: [], actions: [] });
describe('meeting TXT and source validation (no provider calls)', () => {
  it('strictly decodes UTF-8 and preserves physical blank lines', () => {
    expect(decodeTranscript('a.txt', 'text/plain; charset=utf-8', Buffer.from('\ufeff甲\r\n\r\n乙'))).toBe('甲\n\n乙');
    expect(() => decodeTranscript('a.txt', 'text/plain', Buffer.from([0xff, 0xfe, 0]))).toThrow('UTF-8');
    expect(() => decodeTranscript('a.pdf', 'text/plain', Buffer.from('text'))).toThrow();
    expect(() => decodeTranscript('a.txt', 'text/plain', Buffer.from(' \n'))).toThrow();
    expect(() => decodeTranscript('a.txt', 'text/plain', Buffer.alloc(1048577))).toThrow();
  });
  it('preserves all long-meeting lines and overlaps without renumbering', () => {
    const text = longMeetingFixture();
    const segments = segmentTranscript(text);
    expect(segments.length).toBeGreaterThan(1);
    const lineCount = text.split('\n').length;
    expect(segments[0].start).toBe(1);
    expect(segments.at(-1)?.end).toBe(lineCount);
    for (let i = 1; i < segments.length; i++) expect(segments[i].start).toBeLessThanOrEqual(segments[i - 1].end);
  });
  it('allows no risks/unknown fields without invention', () => {
    expect(parseAnalysis(JSON.stringify(emptyAnalysis()), '例行检查')).toEqual(emptyAnalysis());
  });
  it('narrows an overly broad citation to the exact physical source line', () => {
    const analysis = emptyAnalysis();
    analysis.topic = { value: '实际议题', evidence: { startLine: 1, endLine: 3, quote: '实际议题' } };
    const parsed = parseAnalysis(JSON.stringify(analysis), '背景\n实际议题\n结束');
    expect(parsed.topic!.evidence).toMatchObject({ startLine: 2, endLine: 2 });
  });
  it('rejects malformed JSON, invented facts, quotes and line numbers', () => {
    expect(() => parseAnalysis('not JSON', '甲')).toThrow();
    const result = emptyAnalysis(); result.topic = { value: '乙', evidence: { startLine: 1, endLine: 1, quote: '甲' } };
    expect(() => parseAnalysis(JSON.stringify(result), '甲')).toThrow('事实');
    result.topic = { value: '甲', evidence: { startLine: 99, endLine: 99, quote: '甲' } };
    expect(() => parseAnalysis(JSON.stringify(result), '甲')).toThrow('行号');
  });
  it('rejects invented owners and relative dates assigned absolute dates', () => {
    const text = '准备复盘，负责人待定，下周五截止。';
    const result = emptyAnalysis(); result.actions = [{ task: '准备复盘', owner: 'CEO', dueDate: null, evidence: { startLine: 1, endLine: 1, quote: text } }];
    expect(() => parseAnalysis(JSON.stringify(result), text)).toThrow('负责人');
    result.actions[0].owner = null; result.actions[0].dueDate = '2026-11-06';
    expect(() => parseAnalysis(JSON.stringify(result), text)).toThrow('日期');
    expect(explicitDates('2026年11月5日；2026-02-30')).toEqual(['2026-11-05']);
  });
  it('anchors action identity to source and extractive task', () => {
    const a = { task: '联系供应商', owner: null, dueDate: null, evidence: { startLine: 2, endLine: 2, quote: '联系供应商确认交付。' } };
    expect(sameAction(a, { ...a, task: '联系供应商确认交付' })).toBe(true);
    expect(taskKey(a)).toBe(taskKey({ ...a, owner: '人工修改' }));
  });
  it('treats injected text as data; validator does not execute it', async () => {
    const text = await readFile('tests/fixtures/meeting-unknown-injection.txt', 'utf8');
    const parsed = parseAnalysis(JSON.stringify(emptyAnalysis()), text);
    expect(parsed.actions).toEqual([]);
  });
});
describe('long meeting orchestration (MOCK LLM)', () => {
  it('merges segments and retains extracted action evidence even when summary omits it', async () => {
    const text = longMeetingFixture();
    const segments = segmentTranscript(text);
    let calls = 0;
    const result = await analyzeTranscript(text, { async complete() {
      const analysis = emptyAnalysis();
      if (calls === segments.length - 1) {
        const line = text.split('\n').length;
        analysis.actions = [{ task: '协调供应商与客户重新确认交付及上线安排', owner: null, dueDate: null, evidence: { startLine: line, endLine: line, quote: text.split('\n')[line - 1] } }];
      }
      calls++;
      return { model: 'mock-only', content: JSON.stringify(analysis) };
    } });
    expect(calls).toBe(segments.length + 1);
    expect(result.result.actions).toHaveLength(1);
    expect(result.result.actions[0].owner).toBeNull();
  });
});
