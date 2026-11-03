import { MemorySources } from './MemoryPanel';
import { useEffect, useRef, useState } from 'react';
import { conversationSchema, conversationsResponse, messagesResponse, type Conversation, type ChatMessage } from '../../../shared/chat';
import './chat.css';
import { KnowledgeLibrary } from './KnowledgeLibrary';

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`/api${path}`, options);
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = data as { error?: { message?: string } };
    throw new Error(error.error?.message || '请求失败，请稍后重试。');
  }
  return data;
}
export function ChatWorkspace() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [knowledgeMode, setKnowledgeMode] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const selection = useRef(selected);
  const listVersion = useRef(0);
  selection.current = selected;

  useEffect(() => {
    const controller = new AbortController();
    const version = ++listVersion.current;
    async function load() {
      try {
        const result = conversationsResponse.parse(await request('/conversations', { signal: controller.signal }));
        if (controller.signal.aborted || version !== listVersion.current) return;
        setConversations(result.conversations);
        let stored: string | null = null;
        try { stored = localStorage.getItem('contextpilot.conversation'); } catch { /* Storage may be disabled. */ }
        setSelected(current => current ?? result.conversations.find(c => c.id === stored)?.id ?? result.conversations[0]?.id ?? null);
      } catch (cause) {
        if (!controller.signal.aborted && version === listVersion.current) setError(cause instanceof Error ? cause.message : '加载会话失败。');
      } finally { if (!controller.signal.aborted && version === listVersion.current) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    try { localStorage.setItem('contextpilot.conversation', selected); } catch { /* Optional preference only. */ }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setMessages([]);
    setLoading(true);
    setError('');
    async function load() {
      try {
        const result = messagesResponse.parse(await request(`/conversations/${selected}/messages`, { signal: controller.signal }));
        if (controller.signal.aborted) return;
        setMessages(result.messages);
        if (result.messages.some(m => m.status === 'processing')) timer = setTimeout(() => { void load(); }, 2000);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '加载历史失败。');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [selected, refresh]);

  async function create() {
    setCreating(true); setError('');
    try {
      const data = await request('/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      const conversation = conversationSchema.parse((data as { conversation: unknown }).conversation);
      listVersion.current += 1;
      setConversations(current => [conversation, ...current]);
      setSelected(conversation.id); setDraft('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败。'); }
    finally { setCreating(false); }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !draft.trim() || sending || creating || loading) return;
    const id = selected;
    setSending(true); setError('');
    try {
      const result = messagesResponse.parse(await request(`/conversations/${id}/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: draft.trim(), clientRequestId: crypto.randomUUID(), knowledgeMode }),
      }));
      if (selection.current === id) {
        setMessages(current => [...current.filter(m => !result.messages.some(row => row.id === m.id)), ...result.messages].sort((a, b) => a.ordinal - b.ordinal));
        setDraft('');
        if (result.messages.some(m => m.status === 'failed')) setError('模型回复失败。消息已保存；可检查配置后重新发送。');
      }
      setRefresh(value => value + 1);
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : '发送失败。'} 如网络中断，请先重新加载历史确认结果，避免重复发送。`);
    } finally { setSending(false); }
  }
  const pending = messages.some(m => m.status === 'processing');
  return <><KnowledgeLibrary /><section id="chat" className="chat-workspace" aria-label="AI 对话工作台">
    <aside className="conversation-list">
      <h2>历史会话</h2>
      <button onClick={() => { void create(); }} disabled={creating || sending || loading}>{creating ? '创建中…' : '新建会话'}</button>
      <ul>{conversations.map(conversation => <li key={conversation.id}><button aria-pressed={selected === conversation.id} disabled={sending || creating} onClick={() => { setSelected(conversation.id); setDraft(''); }}>{conversation.title}</button></li>)}</ul>
      {!conversations.length && !loading ? <p>暂无会话，创建后开始对话。</p> : null}
    </aside>
    <div className="chat-panel">
      <div className="chat-heading"><h2>AI 对话</h2><button disabled={sending || creating} onClick={() => setRefresh(value => value + 1)}>重新加载历史</button></div>
      {error ? <p className="chat-error" role="alert">{error}</p> : null}
      <div className="chat-messages" aria-label="聊天消息" aria-busy={loading || sending || pending}>
        {loading ? <p>正在加载历史…</p> : null}
        {!loading && selected && !messages.length ? <p>发送第一条消息。历史保存在云端数据库中。</p> : null}
        {messages.map(message => <article className={`chat-message ${message.role}`} key={message.id} aria-label={message.role === 'user' ? '用户消息' : 'AI 消息'}>
          <strong>{message.role === 'user' ? '你' : 'ContextPilot'}</strong>
          <div className="message-content">{message.status === 'processing' ? '正在生成回复…' : message.status === 'failed' ? `回复失败（${message.errorCode || 'UNKNOWN'}），原消息已保存。` : message.content}</div>
          {message.memorySources.length ? <p>本回答使用以下历史记忆：</p> : null}
          {message.memorySources.map(m => <MemorySources key={m.id} memory={m} />)}
          {message.sources.map((source, i) => <details key={`${source.sourceId}-${i}`} className="citation"><summary>[{i + 1}] {source.filename} · 第 {source.page} 页</summary><blockquote>{source.quote}</blockquote><a href={`/api/documents/${source.documentId}/download`}>下载原始 PDF 核对</a></details>)}
        </article>)}
        {sending ? <p role="status">正在生成并保存回复，请稍候…</p> : null}
      </div>
      <form onSubmit={event => { void send(event); }}>
        <label className="knowledge-toggle"><input type="checkbox" checked={knowledgeMode} onChange={event => setKnowledgeMode(event.target.checked)} disabled={creating || sending} /> 使用 PDF 知识库</label>
        <label htmlFor="chat-input">消息</label>
        <textarea id="chat-input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} rows={3} disabled={!selected || creating || sending || loading || pending} placeholder="输入消息，开始多轮对话…" />
        <div className="composer-actions"><small>{knowledgeMode ? '仅按当前问题检索全部已就绪 PDF · 回答附原文证据' : '普通对话 · 自动召回已就绪历史记忆 · 不含联网'}</small><button type="submit" disabled={!selected || !draft.trim() || creating || sending || loading || pending}>发送消息</button></div>
      </form>
    </div>
  </section></>;
}
