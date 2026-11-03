import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { PublicError } from '../errors.js';

export interface Embedder { space: string; dimensions: number; embed(texts: string[]): Promise<number[][]> }
const responseSchema = z.object({ data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number().finite()) })) });
export function createEmbedder(env: Env, transport: typeof fetch = fetch): Embedder | null {
  if (!env.EMBEDDING_BASE_URL || !env.EMBEDDING_API_KEY || !env.EMBEDDING_MODEL || !env.EMBEDDING_DIMENSIONS) return null;
  const dimensions = env.EMBEDDING_DIMENSIONS;
  const space = createHash('sha256').update(`${env.EMBEDDING_BASE_URL.replace(/\/+$/, '')}|${env.EMBEDDING_MODEL}|${dimensions}`).digest('hex');
  return { space, dimensions, async embed(texts) {
    if (!texts.length || texts.length > 16) throw new PublicError(422, 'EMBEDDING_BATCH_LIMIT', '向量批次必须包含 1–16 个片段。');
    try {
      const response = await transport(`${env.EMBEDDING_BASE_URL!.replace(/\/+$/, '')}/embeddings`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { authorization: `Bearer ${env.EMBEDDING_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: env.EMBEDDING_MODEL, input: texts, encoding_format: 'float' }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new PublicError(502, 'EMBEDDING_UPSTREAM_ERROR', 'Embedding 服务调用失败。'); }
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.data.length !== texts.length) throw new PublicError(502, 'EMBEDDING_INVALID_RESPONSE', 'Embedding 返回数量或格式错误。');
      const ordered = [...parsed.data.data].sort((a, b) => a.index - b.index);
      if (ordered.some((row, i) => row.index !== i || row.embedding.length !== dimensions || !row.embedding.some(v => v !== 0))) throw new PublicError(502, 'EMBEDDING_DIMENSION_MISMATCH', 'Embedding 维度或索引不匹配，未保存向量。');
      return ordered.map(row => row.embedding);
    } catch (error) {
      if (error instanceof PublicError) throw error;
      throw new PublicError(502, 'EMBEDDING_CONNECTION_FAILED', 'Embedding 连接失败或超时。');
    }
  } };
}
