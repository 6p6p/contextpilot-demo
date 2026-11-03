// Opt-in live-test instrumentation only. Never records URL, headers or bodies.
import { appendFileSync, mkdirSync } from 'node:fs';
const originalFetch = globalThis.fetch;
let halted = false;
const calls = { embedding: 0, llm: 0 };
mkdirSync('.acceptance', { recursive: true });
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input);
  const kind = url.pathname.endsWith('/embeddings') ? 'embedding' : url.pathname.endsWith('/chat/completions') ? 'llm' : null;
  if (!kind) return originalFetch(input, init);
  if (halted || calls[kind] >= (kind === 'embedding' ? 12 : 6)) throw new Error('Acceptance call guard stopped external model requests');
  calls[kind]++;
  try {
    const response = await originalFetch(input, init);
    const body = response.ok ? await response.clone().json() : null;
    const report = { kind, status: response.status, promptTokens: body?.usage?.prompt_tokens ?? null, completionTokens: body?.usage?.completion_tokens ?? null, totalTokens: body?.usage?.total_tokens ?? null };
    appendFileSync('.acceptance/usage.jsonl', JSON.stringify(report) + '\n');
    if (!response.ok) halted = true;
    return response;
  } catch (error) { halted = true; throw error; }
};
