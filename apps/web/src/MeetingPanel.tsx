import {ActionDialog} from './ActionDialog';
import { EmailDeliveryPanel } from './EmailDeliveryPanel';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { meetingDetailSchema, type MeetingDetail, type Evidence } from '../../../shared/meetings';
import './meetings.css';

const listSchema = z.object({ meetings: z.array(z.object({ id: z.uuid(), filename: z.string(), status: z.enum(['uploaded', 'processing', 'ready', 'failed']) })) });
const labels = { uploaded: '已上传，等待分析', processing: '分析中', ready: '分析完成', failed: '分析失败' };
async function api(path: string, options?: RequestInit) {
  const response = await fetch(`/api${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || '会议请求失败。');
  return body;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
function EvidenceView({ evidence }: { evidence: Evidence }) {
  return <details className="citation"><summary>原文 L{evidence.startLine}–L{evidence.endLine}</summary><blockquote>{evidence.quote}</blockquote></details>;
}
function TodoEditor({ todo, currentAnalysis, reload, onError }: { todo: MeetingDetail['todos'][number]; currentAnalysis: string | null; reload: (notice?:string) => void; onError: (message: string) => void }) {
  const [owner, setOwner] = useState(todo.owner ?? '');
  const [date, setDate] = useState(todo.dueDate ?? '');
  const [status, setStatus] = useState(todo.status);
  const [ignoring,setIgnoring]=useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setOwner(todo.owner ?? ''); setDate(todo.dueDate ?? ''); setStatus(todo.status); }, [todo.id, todo.version, todo.owner, todo.dueDate, todo.status]);
  async function save() {
    setSaving(true);
    try { await api(`/meeting-todos/${todo.id}`, json('PATCH', { version: todo.version, owner: owner.trim() || null, dueDate: date || null, status })); reload('待办已保存，后续分析不会覆盖人工字段。'); }
    catch (error) { onError(error instanceof Error ? error.message : '待办保存失败。'); }
    finally { setSaving(false); }
  }
  return <article className="meeting-todo" data-todo-id={todo.id} data-ignored={todo.ignored}><strong>{todo.origin==='meeting_question'?'[待确认] ':todo.origin==='risk_followup'?'[AI建议] ':'[明确行动] '}{todo.task}</strong><small>{todo.origin === 'risk_followup' ? '风险跟进建议，非会议原文指令' : todo.origin==='meeting_question'?'待确认问题，尚非分配行动':'会议明确行动项'}{todo.analysisId !== currentAnalysis ? ' · 来自旧分析，保留人工数据' : ''}</small>
    <EvidenceView evidence={todo.evidence} />
    {todo.ignored?<p>已忽略：不进入新的正式邮件或PPT待办清单，原文保留。</p>:null}<button type="button" disabled={saving} onClick={()=>setIgnoring(true)}>{todo.ignored?'恢复待办':'忽略 / 移除待办'}</button><div hidden={todo.ignored} className="meeting-form-row"><label>负责人<input aria-label="待办负责人" value={owner} placeholder="未知，待确认" onChange={e => setOwner(e.target.value)} /></label><label>截止日期<input aria-label="待办截止日期" type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>处理状态<select aria-label="待办处理状态" value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="open">待处理</option><option value="in_progress">进行中</option><option value="done">已完成</option></select></label><button disabled={saving} onClick={() => { void save(); }}>保存待办</button></div>
    <ActionDialog open={ignoring} title={todo.ignored?'恢复待办':'忽略待办'} description="保留原始会议证据与人工字段；忽略后不进入新的正式邮件和PPT待办清单。" onClose={()=>setIgnoring(false)} onConfirm={async()=>{await api(`/meeting-todos/${todo.id}/ignore`,json('POST',{version:todo.version,restore:todo.ignored}));reload(todo.ignored?'待办已恢复':'待办已忽略，历史证据仍保留');}}/>
  </article>;
}
function DraftEditor({ draft, reload, onError }: { draft: NonNullable<MeetingDetail['draft']>; reload: (notice?:string) => void; onError: (message: string) => void }) {
  const [recipients, setRecipients] = useState(draft.recipients.join(', '));
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRecipients(draft.recipients.join(', ')); setSubject(draft.subject); setBody(draft.body); }, [draft.id, draft.version, draft.recipients.join(','), draft.subject, draft.body]);
  const dirty = recipients !== draft.recipients.join(', ') || subject !== draft.subject || body !== draft.body;
  async function save(confirm: boolean) {
    setBusy(true);
    try {
      if (confirm) await api(`/email-drafts/${draft.id}/confirm`, json('POST', { version: draft.version }));
      else await api(`/email-drafts/${draft.id}`, json('PATCH', { version: draft.version, recipients: recipients.split(/[,，;；]/).map(s => s.trim()).filter(Boolean), subject, body }));
      reload(confirm?'此版本已确认，未发送邮件。':'草稿新版本已保存，请复核后确认。');
    } catch (error) { onError(error instanceof Error ? error.message : '草稿操作失败。'); }
    finally { setBusy(false); }
  }
  return <section id="meeting-email-draft" className="mail-draft" aria-label="会议邮件草稿"><h3>邮件草稿 · v{draft.version}</h3><p>版本确认本身不发送邮件，需在下方单独确认真实发送。{draft.state === 'confirmed' ? '此版本已确认；发送情况以历史为准。' : '待人工复核。'}</p>{draft.stale ? <p className="chat-error">来源或待办已变化，旧正文不代表最新状态；请更新预览、复核并保存后再确认。</p> : null}
    <button type="button" disabled={busy} onClick={()=>{setBusy(true);void api(`/email-drafts/${draft.id}/latest-preview`).then(data=>{setSubject(data.subject);setBody(data.body);}).catch(()=>onError('最新待办预览失败')).finally(()=>setBusy(false));}}>按最新待办更新预览（需复核保存）</button><label>收件人（由用户明确指定）<input aria-label="草稿收件人" value={recipients} onChange={e => setRecipients(e.target.value)} placeholder="多个邮箱用逗号分隔" /></label>
    <label>主题<input aria-label="草稿主题" value={subject} onChange={e => setSubject(e.target.value)} /></label>
    <label>正文<textarea aria-label="草稿正文" rows={9} value={body} onChange={e => setBody(e.target.value)} /></label>
    <div className="meeting-actions"><button disabled={busy} onClick={() => { void save(false); }}>复核并保存草稿</button><button disabled={busy || dirty || draft.stale || !draft.recipients.length} onClick={() => { void save(true); }}>确认此版本（不发送）</button></div>
    <EmailDeliveryPanel draft={draft} dirty={dirty} />
  </section>;
}
export function MeetingPanel() {
  const [notice,setNotice]=useState('');
  const [listError,setListError]=useState('');
  const [list, setList] = useState<z.infer<typeof listSchema>['meetings']>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [revision, setRevision] = useState(0);
  const [transcript, setTranscript] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const reload = (message?:string) => {if(message)setNotice(message);setRevision(value => value + 1);};
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try { const data = listSchema.parse(await api('/meetings', { signal: controller.signal })); if (!controller.signal.aborted){setList(data.meetings);setListError('');} }
      catch { if(!controller.signal.aborted)setListError('会议列表读取失败，请检查连接后刷新。'); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => { void load(); }, 3000); }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setDetail(null); setTranscript(null);
    async function load() {
      try { const data = meetingDetailSchema.parse(await api(`/meetings/${selected}`, { signal: controller.signal })); if (!controller.signal.aborted) { setDetail(data); if (data.meeting.status === 'uploaded' || data.meeting.status === 'processing') timer = setTimeout(() => { void load(); }, 2000); } }
      catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '会议加载失败。'); }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [selected, revision]);
  async function upload(file: File) {
    if (!file.name.toLowerCase().endsWith('.txt') || !file.size || file.size > 1024 * 1024) { setError('请上传非空且不超过 1 MiB 的 UTF-8 TXT。'); return; }
    setUploading(true); setError('');
    try { const data = await api(`/meetings?filename=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'content-type': 'text/plain; charset=utf-8' }, body: file }); setSelected(data.meeting.id); reload(); if (data.duplicate) setError('相同内容已存在，已打开原会议；未重复分析。'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'TXT 上传失败。'); }
    finally { setUploading(false); if (input.current) input.current.value = ''; }
  }
  async function reanalyze() {
    if (!selected) return;
    setRestarting(true); setError('');
    try { await api(`/meetings/${selected}/reanalyze`, { method: 'POST' }); reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '重新分析失败。'); }
    finally { setRestarting(false); }
  }
  const result = detail?.analysis?.result;
  return <section id="meetings" className="meeting-panel" aria-label="会议分析与风险待办"><div className="chat-heading"><h2>会议分析与风险待办</h2><label className="upload-label">{uploading ? '上传中…' : '上传会议 TXT'}<input ref={input} aria-label="上传会议 TXT" type="file" accept=".txt,text/plain" disabled={uploading} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }} /></label></div>
    <p>UTF-8 TXT · 1 MiB / 64000 字符上限 · 风险均需原文证据 · 邮件须人工确认版本并单独确认发送</p>
    {error||listError ? <p role="alert" className="chat-error">{error||listError}</p> : null}{notice?<p role="status">{notice}</p>:null}
    <ul className="meeting-list">{list.map(row => <li key={row.id}><button data-meeting-id={row.id} aria-pressed={row.id === selected} onClick={() => { setSelected(row.id); setError(''); }}>{row.filename} · {labels[row.status]}</button></li>)}</ul>
    {detail ? <div data-selected-meeting={detail.meeting.id}><div className="meeting-actions"><strong>{labels[detail.meeting.status]} · {detail.meeting.lineCount} 行 · 已保留 {detail.versions.length} 个分析版本</strong><button disabled={restarting || detail.meeting.status === 'processing' || detail.meeting.status === 'uploaded'} onClick={() => { void reanalyze(); }}>重新分析（保留人工编辑）</button><button onClick={() => { void api(`/meetings/${selected}/transcript`).then(data => setTranscript(data.transcript)).catch(() => setError('原文加载失败。')); }}>查看带行号原文</button></div>
      {detail.meeting.status === 'failed' ? <p className="chat-error">{detail.meeting.errorMessage}（{detail.meeting.errorCode}）</p> : null}
      {transcript !== null ? <pre className="meeting-transcript">{transcript.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n')}</pre> : null}
      {detail.draft?<a href="#meeting-email-draft">查看邮件草稿（确认不发送）</a>:null}
      {result ? <><h3>{result.topic?.value ?? '会议主题未知'}</h3><p>日期：{result.meetingDate?.value ?? '未知'} · 地点：{result.location?.value ?? '未知'} · 人物：{result.participants.map(p => p.value).join('、') || '未知'}</p>
        <h4>讨论议题与关键决策</h4>{[...result.topics, ...result.decisions].map((fact, i) => <div key={i}><p>{fact.value}</p><EvidenceView evidence={fact.evidence} /></div>)}
        <h3>潜在风险（AI 分析，需人工复核）</h3>{!detail.risks.length ? <p>未识别到有证据支持的业务风险。</p> : detail.risks.map(risk => <article className="meeting-risk" key={risk.id}><strong>{risk.type} · {risk.level}</strong><p>{risk.description}</p><p>潜在影响：{risk.impact}</p>{risk.evidence.map((e, i) => <EvidenceView key={i} evidence={e} />)}</article>)}
        <h3>待办</h3>{detail.todos.map(todo => <TodoEditor key={todo.id} todo={todo} currentAnalysis={detail.meeting.currentAnalysisId} reload={reload} onError={setError} />)}
        {detail.draft ? <DraftEditor draft={detail.draft} reload={reload} onError={setError} /> : <p>当前没有需要跟进的风险邮件草稿；仅完成分析且识别到风险时自动准备草稿。</p>}
      </> : <p>等待会议分析；不会展示未完成结果。</p>}
    </div> : <p>{selected ? '加载会议中…' : '上传或选择会议查看分析。'}</p>}
  </section>;
}
