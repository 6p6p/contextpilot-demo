import { z } from 'zod';
import type { Env } from '../config/env.js';
import { PublicError } from '../errors.js';

export type ModelMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export interface ChatModel { complete(messages: ModelMessage[]): Promise<{ content: string; model: string }> }
const responseSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().trim().min(1).max(100000) }) })).min(1) });

export function createChatModel(env: Env, transport: typeof fetch = fetch): ChatModel | null {
  if (!env.LLM_BASE_URL || !env.LLM_API_KEY || !env.LLM_MODEL) return null;
  const { LLM_BASE_URL: base, LLM_API_KEY: key, LLM_MODEL: model } = env;
  return { async complete(messages) {
    try {
      const response = await transport(`${base.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, stream: false, max_tokens: env.LLM_MAX_TOKENS }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new PublicError(502, response.status === 429 ? 'LLM_RATE_LIMITED' : 'LLM_UPSTREAM_ERROR', '模型服务调用失败，请检查后端配置或稍后重试。');
      }
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) throw new PublicError(502, 'LLM_INVALID_RESPONSE', '模型未返回有效文本。');
      return { content: parsed.data.choices[0].message.content, model };
    } catch (error) {
      if (error instanceof PublicError) throw error;
      throw new PublicError(502, 'LLM_CONNECTION_FAILED', '模型连接失败或超时，请稍后重试。');
    }
  } };
}
