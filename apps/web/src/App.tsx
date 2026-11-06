import { MemoryPanel } from './MemoryPanel';
import { useEffect, useState } from 'react';
import { healthSchema, type Health } from '../../../shared/health';
import { ChatWorkspace } from './ChatWorkspace';
import {KnowledgeLibrary} from './KnowledgeLibrary';
import { MeetingPanel } from './MeetingPanel';


export function App() {
  const [tool,setTool]=useState('chat');
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

  return <div className="workspace ui-v2">
    <aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setTool('chat');}}>ContextPilot<span>AI 决策助手</span></a>
      <nav aria-label="工作台模块">{[['chat','对话'],['knowledge','知识库'],['meetings','会议与待办'],['memory','长期记忆'],['ppt','PPT 文件']].map(([key,label])=><button key={key} type="button" aria-pressed={tool===key} onClick={()=>setTool(key)}>{label}</button>)}</nav>
      <div className="sidebar-foot">私有演示工作区 · 邮件发送关闭</div>
    </aside>
    <main><header className="workspace-top"><h1>AI 决策助手</h1><div className="connection" role="status"><strong>{error?'后端连接失败':health?'后端已连接':'正在检查后端…'}</strong>{health?.database==='not_configured'?<span>数据库未配置</span>:null}<button onClick={()=>setAttempt(v=>v+1)}>重新检查</button></div></header>
      <ChatWorkspace activeTool={tool} onChat={()=>setTool('chat')}>
        <section className="tool-view" hidden={tool!=='knowledge'}><KnowledgeLibrary/></section>
        <section className="tool-view" hidden={tool!=='meetings'}><MeetingPanel/></section>
        <section className="tool-view" hidden={tool!=='memory'}><MemoryPanel/></section>
      </ChatWorkspace>
    </main>
  </div>;
}
