import type { ModelMessage } from '../llm/adapter.js';

// Extension boundary: later phases can supply attributed retrieval context here.
// This phase has no retrieval implementation, tool executor or cross-session memory.
export interface ContextSource { text: string; sourceId: string; kind: 'knowledge' | 'memory' }
export interface ContextProvider { retrieve(query: string): Promise<ContextSource[]> }

export function buildContext(history: { role: 'user' | 'assistant'; content: string; status: string }[]): ModelMessage[] {
  const selected: ModelMessage[] = [];
  let characters = 0;
  for (const message of history.filter(m => m.status === 'completed').slice(-20).reverse()) {
    if (characters + message.content.length > 24000) break;
    characters += message.content.length;
    selected.unshift({ role: message.role, content: message.content });
  }
  // Avoid an assistant-only prefix after history truncation.
  while (selected[0]?.role === 'assistant') selected.shift();
  return [{ role: 'system', content: '你是 ContextPilot，帮助用户清晰分析问题。只基于当前会话已提供的信息回答；不知道时明确说明。当前没有联网、文件检索、长期记忆或发送邮件的能力，不要声称已执行这些操作。' }, ...selected];
}
