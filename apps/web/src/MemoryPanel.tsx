import { useEffect, useState } from 'react';
import { memoryListSchema, type MemoryCitation } from '../../../shared/memory';
const labels = { person: '人物', time: '时间原文', place: '地点', topic: '主题', event: '事件', decision: '决策' };
export function MemorySources({ memory }: { memory: MemoryCitation }) {
  return <details className="citation"><summary>{labels[memory.kind]} · {memory.content}</summary>
    {memory.sources.map(s => <div key={s.sourceId}><p>{s.sourceType === 'chat' ? '用户聊天消息' : '会议分析'} · 记录时间 {s.observedAt}（不是事件发生时间）</p><p>来源 ID：{s.sourceId}</p><blockquote>L{s.evidence.startLine}–{s.evidence.endLine} {s.evidence.quote}</blockquote><a href={s.sourceType === 'chat' ? `/api/conversations/${s.parentId}/messages` : `/api/meetings/${s.parentId}/transcript`} target="_blank" rel="noreferrer">核对原始来源</a></div>)}
    <small>来源陈述可能已过时；同名不代表同一人，冲突事实按来源保留。</small>
  </details>;
}
export function MemoryPanel() {
  const [refreshing,setRefreshing]=useState(true);
  const [refreshedAt,setRefreshedAt]=useState('');
  const [data, setData] = useState<ReturnType<typeof memoryListSchema.parse> | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();setRefreshing(true);
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch('/api/memories', { signal: controller.signal });
        if (!response.ok) throw new Error('长期记忆不可用，请检查数据库配置和迁移。');
        const next = memoryListSchema.parse(await response.json());
        if (!controller.signal.aborted) { setData(next); setError('');setRefreshedAt(new Date().toLocaleTimeString()); timer = setTimeout(() => { void load(); }, 5000); }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '加载失败'); } finally {if(!controller.signal.aborted)setRefreshing(false);}
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh]);
  return <section id="memory" className="status-card" aria-label="长期记忆"><div><h2>长期记忆</h2><p>自动提取用户消息与新完成的会议分析。提取就绪后才可召回；只展示最近100条事实和任务。</p><button disabled={refreshing} onClick={() => setRefresh(v => v + 1)}>{refreshing?'刷新中…':'刷新记忆'}</button><p role="status">{refreshing?'正在读取记忆和任务状态…':error?'刷新失败':`已刷新 ${refreshedAt}`}</p>
    {error ? <p role="alert">{error}</p> : null}
    {data ? <><p role="status">{data.configured ? '提取服务已配置' : '提取服务未配置，排队任务不会执行'} · {data.memories.length} 条记忆</p>
      {data.memories.map(m => <MemorySources key={m.id} memory={m} />)}
      <details><summary>诊断：提取任务状态与来源 ID</summary>{data.jobs.map(j => <p key={j.id}>{j.sourceType} · {j.sourceId} · {j.status}{j.errorCode ? `（${j.errorCode}）` : ''}</p>)}</details></> : null}
    {!data && !error ? <p role="status">正在加载记忆…</p> : null}
  </div></section>;
}
