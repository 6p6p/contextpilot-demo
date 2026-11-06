import { isPresentationIntent, parsePresentationRequest } from '../presentations/intent.js';
import type { PresentationService, PresentationInput } from '../presentations/service.js';
import { needsSearch, type SearchProvider } from '../search/service.js';
import {answerPublicSearch} from '../search/public.js';
import type { SearchMode } from '../../../../shared/search.js';
import { answerWithMemory, type MemoryService } from '../memory/service.js';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { conversations, messages, memoryJobs } from '../db/schema.js';
import type { createDatabase } from '../db/client.js';
import type { ChatModel } from '../llm/adapter.js';
import { PublicError } from '../errors.js';
import { buildContext } from './context.js';
import {useCurrentContext} from '../evidence/policy.js';
import {visible} from '../management.js';
import type { KnowledgeAnswerer } from '../knowledge/retrieval.js';

export function createChatService(database: NonNullable<ReturnType<typeof createDatabase>>, model: ChatModel | null, knowledge?: KnowledgeAnswerer | null, memory?: MemoryService | null, search?: SearchProvider | null, presentations?: PresentationService | null) {
  const db = database.db;
  const expire = (conversationId: string) => db.update(messages).set({ status: 'failed', errorCode: 'GENERATION_INTERRUPTED', updatedAt: new Date() }).where(and(eq(messages.conversationId, conversationId), eq(messages.status, 'processing'), sql`${messages.createdAt} < now() - (case when ${messages.searchMode} = 'required' then interval '180 seconds' when ${messages.knowledgeMode} then interval '180 seconds' else interval '90 seconds' end)`));
  async function requireConversation(id: string) {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conversation) throw new PublicError(404, 'CONVERSATION_NOT_FOUND', '会话不存在。');
    return conversation;
  }
  async function history(id: string) {
    await requireConversation(id);
    await expire(id);
    // Bounded recent history; all messages remain persisted in PostgreSQL.
    const rows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(desc(messages.ordinal)).limit(200);
    return rows.reverse();
  }
  return {
    list: () => db.select().from(conversations).where(visible(conversations,'archived_at')).orderBy(desc(conversations.updatedAt)).limit(100),
    async create(title: string) { return (await db.insert(conversations).values({ title }).returning())[0]; },
    history,
    async send(id: string, input: PresentationInput & {clientRequestId:string}) {
      const isPpt=isPresentationIntent(input.content);
      if(isPpt){parsePresentationRequest(input.content);if(!presentations)throw new PublicError(503,'PPT_NOT_CONFIGURED','PPT 服务尚未配置。');presentations.requireConfigured();}
      if (!model) throw new PublicError(503, 'LLM_NOT_CONFIGURED', '尚未配置模型服务。');
      if (!isPpt && input.knowledgeMode && !knowledge) throw new PublicError(503, 'KNOWLEDGE_NOT_CONFIGURED', '尚未配置 Embedding 知识检索服务。');
      await expire(id);
      const preparation = await db.transaction(async tx => {
        const [conversation] = await tx.select().from(conversations).where(and(eq(conversations.id, id),visible(conversations,'archived_at'))).for('update');
        if (!conversation) throw new PublicError(404, 'CONVERSATION_NOT_FOUND', '会话不存在。');
        const previous = await tx.select().from(messages).where(and(eq(messages.conversationId, id), eq(messages.clientRequestId, input.clientRequestId))).orderBy(asc(messages.ordinal));
        if (previous.length) {
          if (previous[0].searchMode !== (input.searchMode ?? 'auto') || previous[0].content !== input.content || previous[0].knowledgeMode !== Boolean(input.knowledgeMode)) throw new PublicError(409, 'REQUEST_CONFLICT', '同一请求标识不能用于不同内容或问答模式。');
          if(isPpt)await presentations!.validateReplay(tx,previous.find(m=>m.role==='assistant')!.id,input);
          return { existing: true as const, rows: previous };
        }
        const [pending] = await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.conversationId, id), eq(messages.status, 'processing'))).limit(1);
        if (pending) throw new PublicError(409, 'CONVERSATION_BUSY', '此会话正在生成回复，请稍后重试。');
        const [last] = await tx.select({ ordinal: messages.ordinal }).from(messages).where(eq(messages.conversationId, id)).orderBy(desc(messages.ordinal)).limit(1);
        const ordinal = (last?.ordinal ?? -1) + 1;
        const rows = await tx.insert(messages).values([
          { conversationId: id, clientRequestId: input.clientRequestId, ordinal, role: 'user', content: input.content, status: 'completed', knowledgeMode: Boolean(input.knowledgeMode), searchMode: input.searchMode ?? 'auto' },
          { conversationId: id, clientRequestId: input.clientRequestId, ordinal: ordinal + 1, role: 'assistant', content: '', status: 'processing', knowledgeMode: Boolean(input.knowledgeMode), searchMode: input.searchMode ?? 'auto' },
        ]).returning();
        if(isPpt){const assistant=rows.find(m=>m.role==='assistant')!;const taskId=await presentations!.enqueue(tx,assistant.id,id,input);const content=`PPT 任务已排队（${taskId}）。请在 PPT 生成记录中查看进度和下载。`;await tx.update(messages).set({status:'completed',content,model:'ppt-job',updatedAt:new Date()}).where(eq(messages.id,assistant.id));assistant.status='completed';assistant.content=content;assistant.model='ppt-job';}
        if (!isPpt && memory) await tx.insert(memoryJobs).values({ scope: memory.scope, messageId: rows.find(m => m.role === 'user')!.id }).onConflictDoNothing();
        await tx.update(conversations).set({ updatedAt: new Date(), ...(ordinal === 0 && conversation.title === '新对话' ? { title: input.content.slice(0, 40) } : {}) }).where(eq(conversations.id, id));
        return { existing: false as const, rows };
      });
      if (preparation.existing || isPpt) return preparation.rows;
      const assistant = preparation.rows.find(m => m.role === 'assistant')!;
      try {
        const recent = await db.select().from(messages).where(and(eq(messages.conversationId, id), sql`${messages.ordinal} < ${assistant.ordinal}`)).orderBy(desc(messages.ordinal)).limit(40);
        const useSearch = !input.knowledgeMode&&needsSearch(input.content, input.searchMode ?? 'auto');
        const web = !input.knowledgeMode&&input.searchMode === 'off' && needsSearch(input.content, 'auto') ? { content: '联网搜索已关闭，无法确认最新信息。请切换自动或必须联网模式。', model: 'web-disabled-gate', webSources: [] } : useSearch ? await answerPublicSearch(input.content, search ?? null, model) : null;
        const chronological=[...recent].reverse();
        const candidates = !web && !input.knowledgeMode && memory && !useCurrentContext(input.content,chronological) ? await memory.retrieve(input.content) : [];
        const result = input.knowledgeMode ? { ...await knowledge!.answer(input.content, model,input.documentIds), memorySources: [] } : web ? { content: '', model: web.model, sources: [], memorySources: [] } : candidates.length ? await answerWithMemory(input.content, buildContext(recent.reverse()), model, candidates) : { ...await model.complete(buildContext(recent.reverse())), sources: [], memorySources: [] };
        await db.update(messages).set({ content: [result.content, web?.content].filter(Boolean).join('\n\n'), webSources: web?.webSources ?? [], model: result.model, sources: result.sources, memorySources: result.memorySources, status: 'completed', updatedAt: new Date() }).where(and(eq(messages.id, assistant.id), eq(messages.status, 'processing')));
      } catch (error) {
        const code = error instanceof PublicError ? error.code : 'GENERATION_FAILED';
        await db.update(messages).set({ status: 'failed', errorCode: code, updatedAt: new Date() }).where(and(eq(messages.id, assistant.id), eq(messages.status, 'processing')));
      }
      return db.select().from(messages).where(and(eq(messages.conversationId, id), eq(messages.clientRequestId, input.clientRequestId))).orderBy(asc(messages.ordinal));
    },
  };
}
