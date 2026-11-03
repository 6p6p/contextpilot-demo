import { describe, expect, it, vi } from 'vitest';
import { createChatModel } from '../../apps/api/src/llm/adapter.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { buildContext } from '../../apps/api/src/chat/context.js';

// MOCK transport only: these tests do not prove a real provider works.
const env = parseEnv({ LLM_BASE_URL: 'https://model.example/v1/', LLM_MODEL: 'test-model', LLM_API_KEY: 'test-only-not-a-real-key' });
describe('LLM adapter (mock transport)', () => {
  it('is unconfigured without all required fields', () => {
    expect(createChatModel(parseEnv({}))).toBeNull();
  });
  it('sends server-owned model and ordered context to compatible API', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'answer' } }] })));
    const model = createChatModel(env, transport)!;
    expect(await model.complete([{ role: 'user', content: 'question' }])).toEqual({ content: 'answer', model: 'test-model' });
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://model.example/v1/chat/completions');
    expect(JSON.parse(String(options?.body))).toMatchObject({ model: 'test-model', stream: false, messages: [{ role: 'user', content: 'question' }] });
    expect(options?.redirect).toBe('error');
  });
  it.each([401, 429, 500])('sanitizes upstream error %s', async status => {
    const model = createChatModel(env, vi.fn<typeof fetch>().mockResolvedValue(new Response('secret upstream body', { status })))!;
    await expect(model.complete([])).rejects.toMatchObject({ statusCode: 502, code: status === 429 ? 'LLM_RATE_LIMITED' : 'LLM_UPSTREAM_ERROR' });
    await expect(model.complete([])).rejects.not.toThrow('secret upstream body');
  });
  it('rejects empty or malformed replies', async () => {
    const model = createChatModel(env, vi.fn<typeof fetch>().mockResolvedValue(new Response('{"choices":[]}')))!;
    await expect(model.complete([])).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
  });
  it('sanitizes network exceptions', async () => {
    const model = createChatModel(env, vi.fn<typeof fetch>().mockRejectedValue(new Error('private endpoint details')))!;
    await expect(model.complete([])).rejects.toMatchObject({ code: 'LLM_CONNECTION_FAILED' });
  });
});
describe('bounded multi-turn context', () => {
  it('preserves ordered completed messages and excludes failed/pending replies', () => {
    const context = buildContext([
      { role: 'user', content: 'my name is Lin', status: 'completed' },
      { role: 'assistant', content: 'hello Lin', status: 'completed' },
      { role: 'assistant', content: '', status: 'failed' },
      { role: 'user', content: 'what is my name?', status: 'completed' },
    ]);
    expect(context.slice(1).map(m => m.content)).toEqual(['my name is Lin', 'hello Lin', 'what is my name?']);
  });
  it('bounds history without omitting latest user input', () => {
    const context = buildContext(Array.from({ length: 100 }, (_, i) => ({ role: 'user' as const, content: String(i), status: 'completed' })));
    expect(context).toHaveLength(21);
    expect(context.at(-1)?.content).toBe('99');
  });
});
