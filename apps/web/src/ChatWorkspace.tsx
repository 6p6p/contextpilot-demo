import {ChatAttachments} from './ChatAttachments';
import {presentationListSchema,type PresentationJob} from '../../../shared/presentations';
import { PresentationPanel,PresentationCard } from './PresentationPanel';
import type { PresentationContext } from '../../../shared/presentations';
import { MemorySources } from './MemoryPanel';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { conversationSchema, conversationsResponse, messagesResponse, type Conversation, type ChatMessage } from '../../../shared/chat';
import './chat.css';
import {ActionDialog} from './ActionDialog';
import {AnswerContent} from './SafeMarkdown';
import type {ReactNode} from 'react';

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`/api${path}`, options);
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = data as { error?: { message?: string } };
    throw new Error(error.error?.message || '请求失败，请稍后重试。');
  }
  return data;
}
export function ChatWorkspace({activeTool='chat',onChat,children}:{activeTool?:string;onChat?:()=>void;children?:ReactNode}) {
  const [management,setManagement]=useState<{kind:'rename'|'archive';conversation:Conversation}|null>(null);
  const [newTitle,setNewTitle]=useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [presentationContext,setPresentationContext]=useState<PresentationContext>({meetingId:null,useMemory:false,webQuery:null,documentIds:[],useChat:false});
  const [contextBusy,setContextBusy]=useState(false);
  const [pptJobs,setPptJobs]=useState<PresentationJob[]>([]);
  const [pptError,setPptError]=useState('');
  const [searchMode, setSearchMode] = useState<'auto' | 'required' | 'off'>('auto');
  const [knowledgeMode, setKnowledgeMode] = useState(false);
  const [pdfScope,setPdfScope]=useState<'all'|'selected'>('all'),[documentIds,setDocumentIds]=useState<string[]>([]);
  const [documents,setDocuments]=useState<{id:string;filename:string}[]>([]);
  const [refresh, setRefresh] = useState(0);
  const selection = useRef(selected);
  const listVersion = useRef(0);
  selection.current = selected;
  useEffect(()=>{setPresentationContext({meetingId:null,useMemory:false,webQuery:null,documentIds:[],useChat:false});setDocumentIds([]);setPdfScope('all');},[selected]);
  useEffect(()=>{if(!knowledgeMode)return;const c=new AbortController();void request('/documents',{signal:c.signal}).then(data=>{if(!c.signal.aborted)setDocuments((data as {documents:{id:string;filename:string;status:string}[]}).documents.filter(d=>d.status==='ready'));}).catch(()=>{if(!c.signal.aborted)setError('PDF 范围加载失败，请刷新资料后重试。');});return()=>c.abort();},[knowledgeMode,refresh]);

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
    if(lastConversation.current!==selected)setMessages([]);
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

  useEffect(()=>{setPptJobs([]);if(!selected)return;const c=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function load(){try{const data=presentationListSchema.parse(await request(`/presentations?conversationId=${selected}`,{signal:c.signal}));if(c.signal.aborted)return;setPptJobs(data.presentations);setPptError('');if(data.presentations.some(j=>!['ready','failed'].includes(j.status)))timer=setTimeout(()=>{void load();},2000);}catch(e){if(!c.signal.aborted)setPptError(e instanceof Error?e.message:'PPT记录读取失败');}}
    void load();return()=>{c.abort();clearTimeout(timer);};},[selected,refresh]);
  async function retryPpt(id:string){try{await request(`/presentations/${id}/retry`,{method:'POST'});setRefresh(v=>v+1);}catch(e){setPptError(e instanceof Error?e.message:'重试失败');}}
  async function create() {
    setCreating(true); setError('');
    try {
      const data = await request('/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      const conversation = conversationSchema.parse((data as { conversation: unknown }).conversation);
      listVersion.current += 1;
      setConversations(current => [conversation, ...current]);
      setSelected(conversation.id); setDraft('');onChat?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败。'); }
    finally { setCreating(false); }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !draft.trim() || sending || creating || loading || contextBusy) return;
    const id = selected;
    stickToBottom.current=true;setSending(true); setError('');
    try {
      const result = messagesResponse.parse(await request(`/conversations/${id}/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: draft.trim(), clientRequestId: crypto.randomUUID(), knowledgeMode:knowledgeMode||Boolean(presentationContext.documentIds?.length), documentIds:presentationContext.documentIds?.length?presentationContext.documentIds:pdfScope==='selected'?documentIds:undefined,searchMode, presentationContext }),
      }));
      if (selection.current === id) {
        setMessages(current => [...current.filter(m => !result.messages.some(row => row.id === m.id)), ...result.messages].sort((a, b) => a.ordinal - b.ordinal));
        setDraft('');
        if(result.messages.some(m=>m.model==='ppt-job'))setPresentationContext({meetingId:null,useMemory:false,webQuery:null,documentIds:[],useChat:false});
        if (result.messages.some(m => m.status === 'failed')) setError('模型回复失败。消息已保存；可检查配置后重新发送。');
      }
      setRefresh(value => value + 1);
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : '发送失败。'} 如网络中断，请先重新加载历史确认结果，避免重复发送。`);
    } finally { setSending(false); }
  }
  const scroller=useRef<HTMLDivElement>(null),stickToBottom=useRef(true),lastConversation=useRef(selected);
  useLayoutEffect(()=>{if(lastConversation.current!==selected){stickToBottom.current=true;lastConversation.current=selected;}if(!loading&&stickToBottom.current&&scroller.current)scroller.current.scrollTop=scroller.current.scrollHeight;},[messages,sending,loading,selected,pptJobs]);
  const pending = messages.some(m => m.status === 'processing');
  return <><section id="chat" className="chat-workspace" aria-label="AI 对话工作台">
    <aside className="conversation-list">
      <h2>历史会话</h2>
      <button onClick={() => { void create(); }} disabled={creating || sending || loading}>{creating ? '创建中…' : '新建会话'}</button>
      <ul>{conversations.map(conversation => <li key={conversation.id}><button aria-pressed={selected === conversation.id} disabled={sending || creating} onClick={() => { setSelected(conversation.id); setDraft('');onChat?.(); }}>{conversation.title}</button><span className="history-actions"><button type="button" disabled={sending||creating} aria-label={`重命名 ${conversation.title}`} onClick={()=>{setNewTitle(conversation.title);setManagement({kind:'rename',conversation});}}>改名</button><button type="button" disabled={sending||creating} aria-label={`删除 ${conversation.title}`} onClick={()=>setManagement({kind:'archive',conversation})}>移除</button></span></li>)}</ul>
      {!conversations.length && !loading ? <p>暂无会话，创建后开始对话。</p> : null}
    </aside>
    <div className="chat-panel">
      <div className="chat-heading"><h2>{activeTool==='chat'||activeTool==='ppt'?'AI 对话':'辅助工作区'}</h2><button disabled={sending || creating} onClick={() => setRefresh(value => value + 1)}>重新加载历史</button></div>
      {error ? <p className="chat-error" role="alert">{error}</p> : null}
      {children}
      <PresentationPanel visible={activeTool==='ppt'} refresh={refresh}/>
      <div className="chat-surface" hidden={activeTool!=='chat'}>
      <div ref={scroller} onScroll={()=>{if(!loading&&scroller.current)stickToBottom.current=scroller.current.scrollHeight-scroller.current.clientHeight-scroller.current.scrollTop<100;}} className="chat-messages" aria-label="聊天消息" aria-busy={loading || sending || pending}>
        {loading ? <p>正在加载历史…</p> : null}
        {!loading&&!selected?<div className="chat-empty"><h2>从一个项目问题开始</h2><p>先创建对话，再按需使用知识库、会议、记忆、搜索与PPT。</p><button type="button" disabled={creating} onClick={()=>{void create();}}>创建第一段对话</button></div>:null}
        {!loading && selected && !messages.length ? <p>发送第一条消息。历史保存在云端数据库中。</p> : null}
        {messages.map(message => <article className={`chat-message ${message.role}`} key={message.id} aria-label={message.role === 'user' ? '用户消息' : 'AI 消息'}>
          <strong>{message.role === 'user' ? '你' : 'ContextPilot'}</strong>
          <div className="message-content">{message.status === 'processing' ? '正在生成回复…' : message.status === 'failed' ? `回复失败（${message.errorCode || 'UNKNOWN'}），原消息已保存。` : message.model==='ppt-job' ? (pptJobs.some(j=>j.assistantMessageId===message.id)?null:'正在恢复PPT任务状态…') : <AnswerContent text={message.content} compactWeb={message.webSources.length>0}/>}</div>
          {pptJobs.filter(j=>j.assistantMessageId===message.id).map(job=><PresentationCard key={job.id} job={job} onRetry={()=>{void retryPpt(job.id);}}/>)}
          {message.status==='failed'?<button type="button" disabled={sending||loading} onClick={()=>{const question=messages.find(m=>m.role==='user'&&m.clientRequestId===message.clientRequestId);if(question)setDraft(question.content);}}>重新编辑问题（不会自动重试）</button>:null}
          {message.webSources.length>0?<p className="web-links">参考来源：{message.webSources.slice(0,3).map(s=><a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"> {s.title} </a>)}</p>:null}
          {message.webSources.map((source, i) => <details className="citation" key={`${source.id}-${i}`}><summary>网页 [{source.id}] {source.title} · {source.quote ? '已引用' : '仅检索'}</summary><a href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a><p>查询时间：{source.queriedAt}{source.publishedAt ? ` · 发布时间：${source.publishedAt}` : ''}</p>{source.quote ? <blockquote>{source.quote}</blockquote> : null}<p>{source.summary}</p></details>)}
          {message.memorySources.length ? <p>本回答使用以下历史记忆：</p> : null}
          {message.memorySources.map(m => <MemorySources key={m.id} memory={m} />)}
          {message.sources.map((source, i) => <details key={`${source.sourceId}-${i}`} className="citation"><summary>[{i + 1}] {source.filename} · 第 {source.page} 页</summary><blockquote>{source.quote}</blockquote><a href={`/api/documents/${source.documentId}/download`}>下载原始 PDF 核对</a></details>)}
        </article>)}
        {sending ? <p role="status">正在处理搜索（如需）并生成、保存回复，请稍候…</p> : null}
      </div>
      <form onSubmit={event => { void send(event); }}>
        <ChatAttachments scopeKey={selected} context={presentationContext} onChange={setPresentationContext} onBusy={setContextBusy} disabled={sending||creating||!selected} />
        {pptError&&messages.some(m=>m.model==='ppt-job')?<p role="alert">{pptError}</p>:null}
        <label>联网搜索 <select aria-label="联网搜索模式" value={searchMode} onChange={e => setSearchMode(e.target.value as typeof searchMode)} disabled={sending || creating}><option value="auto">自动</option><option value="required">必须联网</option><option value="off">关闭</option></select></label>
        <label className="knowledge-toggle"><input type="checkbox" checked={knowledgeMode} onChange={event => setKnowledgeMode(event.target.checked)} disabled={creating || sending} /> 使用 PDF 知识库</label>
        {knowledgeMode?<small role="status">当前仅检索 PDF，不召回长期记忆；查询记忆时请关闭此开关并关闭联网。</small>:null}
        {knowledgeMode?<><label>问答 PDF 范围<select aria-label="问答 PDF 范围" value={pdfScope} onChange={e=>setPdfScope(e.target.value as typeof pdfScope)}><option value="all">全部有效知识库</option><option value="selected">仅选中的 PDF</option></select></label>{pdfScope==='selected'?<label>问答 PDF 文件<select multiple aria-label="问答 PDF 文件" value={documentIds} onChange={e=>setDocumentIds(Array.from(e.target.selectedOptions,o=>o.value))}>{documents.map(d=><option key={d.id} value={d.id}>{d.filename}</option>)}</select></label>:null}</>:null}
        <label htmlFor="chat-input">消息</label>
        <textarea id="chat-input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} rows={3} disabled={!selected || creating || sending || loading || pending} placeholder="输入消息，开始多轮对话…" />
        <div className="composer-actions"><small>{knowledgeMode ? `${pdfScope==='all'?'全库':'仅选定资料'} PDF 问答 · +选择的附件用于本次输出` : '普通对话 · 自动召回历史记忆 · 联网按所选模式 · 仅输入公共短查询'}</small><button type="submit" disabled={!selected || !draft.trim() || creating || sending || loading || pending || contextBusy}>发送消息</button></div>
      </form>
      </div>
    </div>
  </section><ActionDialog open={Boolean(management)} title={management?.kind==='rename'?'重命名会话':'删除会话（归档）'} description={management?.kind==='rename'?'修改标题，不改变对话内容。':'从历史列表和新的记忆检索中移除；保留消息、历史引用和PPT文件，不执行物理删除。'} onClose={()=>setManagement(null)} onConfirm={async()=>{
    if(!management)return;const {conversation,kind}=management;
    await request(`/conversations/${conversation.id}`,kind==='rename'?{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({title:newTitle})}:{method:'DELETE'});
    if(kind==='archive'&&selected===conversation.id){setSelected(null);setMessages([]);}setRefresh(v=>v+1);
  }}>{management?.kind==='rename'?<label>会话名称<input autoFocus value={newTitle} maxLength={100} onChange={e=>setNewTitle(e.target.value)}/></label>:null}</ActionDialog></>;
}
