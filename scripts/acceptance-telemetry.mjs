// Opt-in live-test instrumentation only. Never records URL, headers or bodies.
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
const originalFetch = globalThis.fetch;
let halted = false;
const calls = { embedding: 0, llm: 0 };
mkdirSync('.acceptance', { recursive: true });
const phase4 = process.env.ACCEPTANCE_PHASE === '4';
const logPath = phase4 ? '.acceptance/phase4-usage.jsonl' : '.acceptance/usage.jsonl';
const prior = phase4 && existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
let reservedRmb = prior.filter(row => row.event === 'reserve').reduce((sum, row) => sum + row.estimatedMaxRmb, 0);
if (phase4) for (const row of prior.filter(row => row.event === 'reserve')) calls[row.kind]++;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input);
  const kind = url.pathname.endsWith('/embeddings') ? 'embedding' : url.pathname.endsWith('/chat/completions') ? 'llm' : null;
  if (!kind) return originalFetch(input, init);
  if (halted || calls[kind] >= (kind === 'embedding' ? 12 : phase4 ? 24 : 6)) throw new Error('Acceptance call guard stopped external model requests');
  if (phase4) {
    const body = JSON.parse(String(init?.body));
    if (kind === 'llm' && (url.hostname !== 'api.deepseek.com' || body.model !== 'deepseek-flash')) throw new Error('Phase 4 budget guard requires verified deepseek-flash pricing');
    if (kind === 'embedding' && body.model !== 'BAAI/bge-m3') throw new Error('Phase 4 budget guard requires verified free embedding model');
    const maxTokens = Number(body.max_tokens || 4096);
    if (kind === 'llm' && (!Number.isFinite(maxTokens) || maxTokens > 8192)) throw new Error('Unbounded model output refused');
    // UTF-8 byte length + overhead upper-bounds this text-only request's input tokens.
    // Official peak flash USD rates, conservatively converted at 10 RMB/USD.
    const estimate = kind === 'llm' ? ((Buffer.byteLength(JSON.stringify(body.messages), 'utf8') + 1024) * 0.3 + maxTokens * 1.2) * 10 / 1000000 : 0;
    if (reservedRmb + estimate > 5) throw new Error('Phase 4 RMB 5 budget guard stopped before request');
    reservedRmb += estimate;
    appendFileSync(logPath, JSON.stringify({ event: 'reserve', kind, estimatedMaxRmb: estimate }) + '\n');
  }
  calls[kind]++;
  try {
    const response = await originalFetch(input, init);
    const body = response.ok ? await response.clone().json() : null;
    const report = { kind, status: response.status, promptTokens: body?.usage?.prompt_tokens ?? null, completionTokens: body?.usage?.completion_tokens ?? null, totalTokens: body?.usage?.total_tokens ?? null, finishReason: body?.choices?.[0]?.finish_reason ?? null };
    appendFileSync(logPath, JSON.stringify(report) + '\n');
    if (!response.ok) halted = true;
    return response;
  } catch (error) { halted = true; throw error; }
};
