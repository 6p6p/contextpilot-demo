import { useEffect, useState } from 'react';
import { healthSchema, type Health } from '../../../shared/health';

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let active = true;
    setHealth(null);
    setError(false);
    async function check() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal });
        if (!response.ok) throw new Error('Health request failed');
        const result = healthSchema.parse(await response.json());
        if (active) setHealth(result);
      } catch {
        if (active) setError(true);
      } finally { clearTimeout(timeout); }
    }
    void check();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  return <div className="workspace">
    <aside className="sidebar">
      <a className="brand" href="/">ContextPilot<span>AI 决策工作台</span></a>
      <div className="workspace-label">南京信人智能 · 实操 Demo</div>
      <nav aria-label="工作台模块">
        <span className="nav-current" aria-current="page">工作台概览</span>
        {['对话与历史', '知识库文件', '会议与待办', '长期记忆', '演示文稿'].map(name => <span className="nav-future" key={name}>{name}<small>待开发</small></span>)}
      </nav>
      <div className="sidebar-foot">单一演示工作区<br />Phase 1 · 工程初始化</div>
    </aside>
    <main>
      <header><span>CONTEXT → DECISION</span><span className="phase">Phase 1</span></header>
      <section className="intro"><p className="eyebrow">CONTEXT PILOT / WORKSPACE</p><h1>让上下文，成为决策的起点。</h1><p>统一连接对话、知识与会议。当前完成工程骨架，业务能力将在后续阶段逐项接入并验证。</p></section>
      <section className="status-card" aria-labelledby="service-title">
        <div><p className="eyebrow">SYSTEM CONNECTION</p><h2 id="service-title">服务连接</h2><p>由浏览器请求真实 Fastify 后端，不使用模拟响应。</p></div>
        <div className="connection" role="status" aria-live="polite">
          <strong>{error ? '后端连接失败' : health ? '后端已连接' : '正在检查后端…'}</strong>
          {health ? <span>{health.database === 'not_configured' ? '数据库未配置' : '数据库已配置，连接未检查'}</span> : null}
          {error ? <span>请检查 API 服务和本地代理配置。</span> : null}
          <button onClick={() => setAttempt(value => value + 1)}>重新检查</button>
        </div>
      </section>
      <section className="roadmap" aria-label="能力规划">
        {[
          ['01', '对话与知识', '多轮对话 · PDF 背景知识'],
          ['02', '会议与行动', '风险证据 · 待办 · 邮件确认'],
          ['03', '记忆与输出', '跨会话记忆 · 联网搜索 · PPT'],
        ].map(([number, title, description]) => <article key={number}><span className="number">{number}</span><h2>{title}</h2><p>{description}</p><span className="planned">尚未实现</span></article>)}
      </section>
      <footer>当前仅验证 Web → API 连接。聊天、上传、记忆、搜索、邮件和 PPT 均未启用。</footer>
    </main>
  </div>;
}
