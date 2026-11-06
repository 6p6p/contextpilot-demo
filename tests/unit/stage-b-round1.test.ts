import { it, expect, vi } from 'vitest';
import { createChatModel } from '../../apps/api/src/llm/adapter.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { answerWithMemory } from '../../apps/api/src/memory/service.js';
import { answerWithSearch } from '../../apps/api/src/search/service.js';
import { web, searchQuestion } from '../corpus/v1/materials.js';
import { buildContext } from '../../apps/api/src/chat/context.js';

it('BUG-01 classifies reasoning-only length response without accepting reasoning as an answer', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'synthetic reasoning, not an answer' } }] })));
  const model = createChatModel(parseEnv({ LLM_BASE_URL: 'https://api.deepseek.com', LLM_MODEL: 'deepseek-flash', LLM_API_KEY: 'stub' }), transport)!;
  await expect(model.complete([], { disableThinking: true })).rejects.toMatchObject({ code: 'LLM_OUTPUT_TRUNCATED' });
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).thinking).toEqual({ type: 'disabled' });
  expect(transport).toHaveBeenCalledTimes(1);
});
it('BUG-01 memory selector explicitly requests bounded JSON/non-thinking output', async () => {
  const complete = vi.fn().mockResolvedValueOnce({ model: 'stub', content: '{"memoryIds":[]}' }).mockResolvedValueOnce({ model: 'stub', content: '本轮当前会话已有明确事实。' });
  const intro='本轮合成验收cee51f13-79e6-42d6-9caa-dc21b81cf079：ORCHID-7421项目总负责人是Dr. Mira Qiao，林岚于2026-11-06在南京协调试点准备；另一项目ORCHID-FIN的林岚负责财务，在苏州，时间2026-12-01。请记住这些明确事实，不能将同名人员合并。';
  const question='刚才我提到的ORCHID-7421项目总负责人是谁？林岚的地点和时间是什么？';
  const history=buildContext([{role:'user',content:intro,status:'completed'},{role:'assistant',content:'已收到本轮合成项目事实。',status:'completed'},{role:'user',content:question,status:'completed'}]);
  await answerWithMemory(question, history, { complete }, []);
  const input=JSON.parse(complete.mock.calls[0][0][1].content);
  expect(input.history.slice(1).map((m:{content:string})=>m.content)).toEqual([intro,'已收到本轮合成项目事实。',question]);
  expect(complete.mock.calls[0][1]).toMatchObject({ jsonMode: true, disableThinking: true, maxTokens: 4096 });
});
it('BUG-02 chooses exact server-owned quote options; reordered IDs remain stable', async () => {
  const complete = vi.fn(async () => ({ model: 'stub', content: JSON.stringify({ status: 'supported', conclusion: { id: 'W2', quoteIndex: 0 }, citations: [{ id: 'W2', quoteIndex: 0 }] }) }));
  const result = await answerWithSearch(searchQuestion, { async search() { return web; } }, { complete });
  expect(result.content).toContain('结论（来源明确记载）');
  const prompt = JSON.parse((complete.mock.calls[0] as any)[0].find((m:any)=>m.role==='user').content);
  expect(prompt.untrustedSearchResults[0].id).toBe('W2');
  expect(prompt.untrustedSearchResults[0].quoteOptions[0]).toBe(web[1].summary);
});
it('BUG-02 unknown IDs, invalid option indexes and rewritten legacy quotes still fail closed', async () => {
  for (const c of [{ id: 'W99', quoteIndex: 0 }, { id: 'W2', quoteIndex: 999 }, { id: 'W2', quote: 'Node.js invented latest version' }]) {
    await expect(answerWithSearch(searchQuestion, { async search() { return web; } }, { async complete() { return { model: 'stub', content: JSON.stringify({ citations: [c] }) }; } })).rejects.toMatchObject({ code: 'SEARCH_INVALID_CITATION' });
  }
});
it('BUG-01 rejected envelope diagnostics never log provider body or reasoning text', async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try{
    const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'',reasoning_content:'PRIVATE_SENTINEL_DO_NOT_LOG'}}]})));
    await expect(createChatModel(parseEnv({LLM_BASE_URL:'https://provider.invalid',LLM_MODEL:'stub',LLM_API_KEY:'SECRET_SENTINEL'}),transport)!.complete([])).rejects.toMatchObject({code:'LLM_OUTPUT_TRUNCATED'});
    expect(warn).toHaveBeenCalled();expect(JSON.stringify(warn.mock.calls)).not.toMatch(/PRIVATE_SENTINEL|SECRET_SENTINEL/);
  }finally{warn.mockRestore();}
});
