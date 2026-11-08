import type { MemoryCitation } from '../../../../shared/memory.js';
const identifiers = (text: string) => [...text.matchAll(/\b[A-Z][A-Z0-9]*-[A-Z0-9]+\b/gi)];
const projectIdentifiers = (value: string, known: Set<string>) => identifiers(value).filter(m => known.has(m[0].toLowerCase()) || /(?:项目|project)\s*[:：]?\s*$/i.test(value.slice(Math.max(0, m.index! - 16), m.index)) || m[0] === m[0].toUpperCase());
export const memoryOnlyRequest = (text: string) => /(?:根据|仅|只|引用|查询|召回|检索|已保存).{0,20}(?:长期|跨会话|会议)?记忆|(?:长期|跨会话|会议)记忆.{0,12}(?:回答|查询|召回|检索|何时|哪里|谁)/.test(text);
export function memoryProjects(question: string) {
  const positive = new Set<string>(), excluded = new Set<string>();
  for (const m of identifiers(question)) {
    const before = question.slice(Math.max(0, m.index! - 24), m.index);
    const negative = /不要.{0,8}(?:混入|使用|包含)|排除|不包括|而非|exclude|not\s+from/i.test(before);
    const after = question.slice(m.index! + m[0].length);
    if (negative || /[A-Z\d]/.test(m[0]) || /(?:项目|project)\s*[:：]?\s*$/i.test(before) || /^(?:的|项目|负责人|预算|进展)/.test(after)) (negative ? excluded : positive).add(m[0].toLowerCase());
  }
  return { positive, excluded };
}
export function compatibleStoredQuote(question: string, quote: string) {
  const { positive, excluded } = memoryProjects(question);
  const ids = projectIdentifiers(quote, new Set([...positive,...excluded])).map(m => m[0].toLowerCase());
  return !ids.some(id => excluded.has(id)) && (!positive.size || !ids.length || ids.some(id => positive.has(id)));
}

// Source text is used only to associate a STORED quote with its project, never to
// add a missing fact to an answer. A new project mention ends inherited context.
export function relatedMemory(question: string, memory: MemoryCitation, originals: Map<string, string>): MemoryCitation | null {
  const { positive, excluded } = memoryProjects(question);
  const meetingOnly = /会议记忆/.test(question);
  const sources: MemoryCitation['sources'] = [];
  for (const source of memory.sources) {
    if (meetingOnly && source.sourceType !== 'meeting') continue;
    const stored = source.evidence.quote;
    if (!stored.includes(memory.content)) continue;
    if (!positive.size && !excluded.size) { sources.push(source); continue; }
    const original = originals.get(source.sourceId) ?? stored;
    const lines = original.split('\n');
    const from = originals.has(source.sourceId) ? lines.slice(0, source.evidence.startLine - 1).join('\n').length + (source.evidence.startLine > 1 ? 1 : 0) : 0;
    const quoteStart = original.indexOf(stored, from);
    if (quoteStart < 0) continue;
    const quoteEnd = quoteStart + stored.length;
    // A room label such as Cedar-17 must not replace the project's context.
    const projectIds = (value: string) => projectIdentifiers(value,new Set([...positive,...excluded]));
    for (const clause of original.matchAll(/[^。；;\n]+[。；;]?/g)) {
      const start = Math.max(clause.index!, quoteStart), end = Math.min(clause.index! + clause[0].length, quoteEnd);
      if (start >= end) continue;
      const quote = original.slice(start, end).trim();
      if (!quote.includes(memory.content)) continue;
      const local = projectIds(clause[0]).map(m => m[0].toLowerCase());
      const preceding = projectIds(original.slice(0, clause.index)).at(-1)?.[0].toLowerCase();
      const projects = new Set(local.length ? local : preceding ? [preceding] : []);
      if ([...projects].some(p => excluded.has(p)) || positive.size && ![...projects].some(p => positive.has(p))) continue;
      const offset = original.indexOf(quote, start);
      sources.push({ ...source, evidence: { quote, startLine: original.slice(0, offset).split('\n').length, endLine: original.slice(0, offset + quote.length).split('\n').length } });
    }
  }
  return sources.length ? { ...memory, sources: sources.filter((s, i, a) => a.findIndex(t => t.sourceId === s.sourceId && t.evidence.quote === s.evidence.quote) === i).slice(-3) } : null;
}
