import { z } from 'zod';
import type { Env } from '../config/env.js';
import { createChatModel } from '../llm/adapter.js';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const metadata = z.object({
  choices: z.array(z.object({
    finish_reason: z.enum(['stop', 'length', 'content_filter', 'tool_calls']).nullish(),
    message: z.object({ content: z.string().nullish(), reasoning_content: z.string().nullish() }),
  })).min(1),
  usage: z.object({ prompt_tokens: count.optional(), completion_tokens: count.optional(),
    completion_tokens_details: z.object({ reasoning_tokens: count.optional() }).optional() }).optional(),
});

// Only this adapter emits meeting diagnostics. Never log prompts, JSON, reasoning,
// URLs, headers, model-provided errors or the configuration's credential values.
export function createMeetingModel(env: Env, transport: typeof fetch = fetch) {
  const measured: typeof fetch = async (input, init) => {
    const start = Date.now();
    const metrics = { event: 'meeting_model_response', maxTokens: env.MEETING_MAX_TOKENS,
      timeoutMs: env.MEETING_TIMEOUT_MS, inputBytes: typeof init?.body === 'string' ? Buffer.byteLength(init.body) : null };
    let response: Response;
    try { response = await transport(input, init); }
    catch (error) { console.info(JSON.stringify({ ...metrics, elapsedMs: Date.now() - start, outcome: 'transport_failed' })); throw error; }
    try {
      const parsed = metadata.safeParse(await response.clone().json());
      const choice = parsed.success ? parsed.data.choices[0] : undefined;
      const usage = parsed.success ? parsed.data.usage : undefined;
      console.info(JSON.stringify({ ...metrics, elapsedMs: Date.now() - start, httpStatus: response.status,
        outcome: parsed.success ? 'response_received' : 'invalid_response', finishReason: choice?.finish_reason ?? null,
        promptTokens: usage?.prompt_tokens ?? null, completionTokens: usage?.completion_tokens ?? null,
        reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null,
        contentChars: choice?.message.content?.length ?? null, reasoningChars: choice?.message.reasoning_content?.length ?? null }));
    } catch { console.info(JSON.stringify({ ...metrics, elapsedMs: Date.now() - start, httpStatus: response.status, outcome: 'unreadable_response' })); }
    return response;
  };
  return createChatModel({ ...env, LLM_MAX_TOKENS: env.MEETING_MAX_TOKENS, LLM_TIMEOUT_MS: env.MEETING_TIMEOUT_MS }, measured, { jsonMode: true });
}
