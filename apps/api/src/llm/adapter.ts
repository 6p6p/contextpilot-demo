import { z } from 'zod';
import type { Env } from '../config/env.js';
import { PublicError } from '../errors.js';

export type ModelMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export interface CompletionOptions { jsonMode?: boolean; maxTokens?: number; disableThinking?: boolean }
export interface ChatModel { complete(messages: ModelMessage[], options?: CompletionOptions): Promise<{ content: string; model: string }> }
const responseSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().trim().min(1).max(100000) }), finish_reason: z.string().nullable().optional() })).min(1) });

export function createChatModel(env: Env, transport: typeof fetch = fetch, options: { jsonMode?: boolean } = {}): ChatModel | null {
  if (!env.LLM_BASE_URL || !env.LLM_API_KEY || !env.LLM_MODEL) return null;
  const { LLM_BASE_URL: base, LLM_API_KEY: key, LLM_MODEL: model } = env;
  return { async complete(messages, requestOptions = {}) {
    const jsonMode = requestOptions.jsonMode ?? options.jsonMode;
    const maxTokens = requestOptions.maxTokens ?? env.LLM_MAX_TOKENS;
    if (!Number.isInteger(maxTokens) || maxTokens < 16 || maxTokens > 8192) throw new PublicError(500, 'LLM_INVALID_LIMIT', '模型输出上限无效。');
    try {
      const response = await transport(`${base.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, stream: false, max_tokens: maxTokens, ...(requestOptions.disableThinking && new URL(base).hostname === 'api.deepseek.com' ? { thinking: { type: 'disabled' } } : {}), ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new PublicError(502, response.status === 429 ? 'LLM_RATE_LIMITED' : 'LLM_UPSTREAM_ERROR', '模型服务调用失败，请检查后端配置或稍后重试。');
      }
      const raw: unknown = await response.json();
      const envelope = z.object({ choices: z.array(z.object({ finish_reason: z.string().nullable().optional() })).min(1) }).safeParse(raw);
      const shape = z.object({ choices:z.array(z.object({message:z.object({content:z.unknown().optional(),reasoning_content:z.unknown().optional()})})).min(1) }).safeParse(raw);
      const message=shape.success?shape.data.choices[0].message:undefined;
      if (envelope.success && envelope.data.choices[0].finish_reason === 'length' && (jsonMode || typeof message?.content !== 'string' || !message.content.trim())) {
        console.warn(JSON.stringify({event:'llm_output_rejected',reason:'length',reasoningPresent:typeof message?.reasoning_content==='string',contentPresent:typeof message?.content==='string'&&Boolean(message.content.trim())}));
        throw new PublicError(502, 'LLM_OUTPUT_TRUNCATED', '模型输出达到长度上限，未发布截断回答；请缩短问题或上下文后人工重试。');
      }
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) { console.warn(JSON.stringify({event:'llm_output_rejected',reason:'invalid_shape',contentType:typeof message?.content,contentLength:typeof message?.content==='string'?message.content.length:null,reasoningPresent:typeof message?.reasoning_content==='string'})); throw new PublicError(502, 'LLM_INVALID_RESPONSE', '模型未返回有效文本。'); }
      return { content: parsed.data.choices[0].message.content, model };
    } catch (error) {
      if (error instanceof PublicError) throw error;
      throw new PublicError(502, 'LLM_CONNECTION_FAILED', '模型连接失败或超时，请稍后重试。');
    }
  } };
}
