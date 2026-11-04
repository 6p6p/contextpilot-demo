import { useEffect, useState } from 'react';
import { emailConfigSchema, emailHistorySchema, deliverySchema, type EmailDelivery } from '../../../shared/email';
import type { MeetingDetail } from '../../../shared/meetings';
const labels: Record<EmailDelivery['status'], string> = { queued: '待发送', processing: '发送处理中', accepted: '供应商已接受（未确认投递）', delivered: '供应商报告已投递至对端邮件服务器', failed: '发送失败或供应商报告失败', unknown: '结果未知：禁止盲目重发' };
async function api(path: string, body?: unknown) {
  const response = await fetch(`/api${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || '邮件请求失败。');
  return data;
}
export function EmailDeliveryPanel({ draft, dirty }: { draft: NonNullable<MeetingDetail['draft']>; dirty: boolean }) {
  const [config, setConfig] = useState<ReturnType<typeof emailConfigSchema.parse> | null>(null);
  const [history, setHistory] = useState<EmailDelivery[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [armed, setArmed] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setArmed(false); setAgreed(false); }, [draft.id, draft.version, dirty]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setHistory(previous => previous.filter(row => row.draftId === draft.id)); setError('');
    async function load() {
      try {
        const responses = await Promise.all([fetch('/api/email/config', { signal: controller.signal }), fetch(`/api/email-drafts/${draft.id}/deliveries`, { signal: controller.signal })]);
        if (responses.some(r => !r.ok)) throw new Error('邮件状态加载失败，请刷新或检查数据库迁移。');
        const [settings, list] = await Promise.all(responses.map(r => r.json()));
        if (controller.signal.aborted) return;
        setConfig(emailConfigSchema.parse(settings)); setHistory(emailHistorySchema.parse(list).deliveries);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '加载失败'); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => { void load(); }, 3000); }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [draft.id, revision]);
  const unresolved = history.some(h => ['queued','processing','unknown'].includes(h.status));
  const current = history.find(h => h.version === draft.version);
  const eligible = Boolean(config?.enabled && config.configured && draft.state === 'confirmed' && !draft.stale && !dirty && !unresolved && !current);
  async function send() {
    if (!agreed || !eligible || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api(`/email-drafts/${draft.id}/send`, { version: draft.version, confirmSend: true });
      const delivery = deliverySchema.parse(response.delivery);
      setHistory(previous => [delivery, ...previous.filter(row => row.id !== delivery.id)]);
      setNotice('发送任务已记录，结果以发送历史为准；不代表收件箱已收到。'); setArmed(false); setAgreed(false); setRevision(v => v + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '发送确认失败，请先核查历史，勿盲目重复。'); }
    finally { setBusy(false); }
  }
  async function inspect(id: string) {
    setBusy(true); setError('');
    try { await api(`/email-deliveries/${id}/refresh`, {}); setRevision(v => v + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '供应商状态查询失败'); }
    finally { setBusy(false); }
  }
  return <section aria-label="邮件发送与历史"><h4>真实邮件发送</h4>
    <p>{config?.enabled ? config.configured ? '服务已配置，发件权限将由服务端再次检查。' : '发送服务未配置完整。' : '真实发送未启用。'}</p>
    {config?.sender ? <p>发件人：{config.sender} · 模式：{config.mode} · 演示白名单：{config.allowedRecipients.join('、')}</p> : null}
    {error ? <p role="alert" className="chat-error">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    <button type="button" disabled={!eligible || busy} onClick={() => { setArmed(true); setAgreed(false); }}>发送此版本…</button>
    {dirty ? <p>请先保存修改并重新确认版本。</p> : null}
    {armed ? <section aria-label="最终发送确认"><h4>确认真实发送 · v{draft.version}</h4><p>收件人：{draft.recipients.join('、')}</p><p>主题：{draft.subject}</p><pre className="meeting-transcript">{draft.body}</pre>
      <label><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />我确认向以上收件人发送此版本</label>
      <button type="button" disabled={!eligible || !agreed || busy} onClick={() => { void send(); }}>{busy ? '正在提交…' : '确认发送邮件'}</button><button type="button" disabled={busy} onClick={() => setArmed(false)}>取消</button>
    </section> : null}
    <h4>发送历史（最近100条）</h4>{!history.length ? <p>尚无发送记录。</p> : history.map(row => <article key={row.id} data-delivery-id={row.id}><strong>v{row.version} · {labels[row.status]}</strong><p>收件人：{row.recipients.join('、')} · {row.subject}</p><p>创建：{row.createdAt} · 尝试：{row.attemptedAt ?? '尚未尝试'} · 核查：{row.checkedAt ?? '未核查'}</p><p>记录 ID：{row.id} · Resend ID：{row.providerMessageId ?? '未知'} · 事件：{row.providerEvent ?? '未查询'} · 错误码：{row.errorCode ?? '无'} · 请求追踪：{row.requestId}</p>
      {row.status === 'unknown' ? <p className="chat-error">请求可能已被接受。请按时间、收件人、主题及追踪ID到 Resend 控制台人工核查；不自动重发，禁止以编辑新版本绕过核查。</p> : null}
      {row.status === 'delivered' ? <p>对端服务器接受不保证邮件位于收件箱，请由收件人核对。</p> : null}
      <details><summary>查看冻结版本</summary><pre className="meeting-transcript">{row.body}</pre></details>
      {row.providerMessageId ? <button type="button" disabled={busy} onClick={() => { void inspect(row.id); }}>核查供应商状态（不重发）</button> : null}
    </article>)}
  </section>;
}
