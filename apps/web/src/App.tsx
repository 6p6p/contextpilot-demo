import { MemoryPanel } from './MemoryPanel';
import { useEffect, useState } from 'react';
import { healthSchema, type Health } from '../../../shared/health';
import { ChatWorkspace } from './ChatWorkspace';
import {KnowledgeLibrary} from './KnowledgeLibrary';
import { MeetingPanel } from './MeetingPanel';
import {Icon} from './Icon';


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

  return <ChatWorkspace activeTool={tool} onChat={()=>setTool('chat')} navigation={<nav aria-label="工作台模块">{([['chat','对话','chat'],['knowledge','知识库','file'],['meetings','会议与待办','meeting'],['memory','长期记忆','memory'],['ppt','PPT 文件','slides']] as const).map(([key,label,icon])=><button key={key} type="button" aria-pressed={tool===key} onClick={()=>setTool(key)}><Icon name={icon}/><span>{label}</span></button>)}</nav>} connection={error||health?.database==='not_configured'?<div className="connection-error" role="status"><span>{error?'无法连接服务，请重试。':'数据库未配置，暂时无法保存对话。'}</span><button onClick={()=>setAttempt(v=>v+1)}>重新检查</button></div>:null}>
        <section className="tool-view" hidden={tool!=='knowledge'}><KnowledgeLibrary/></section>
        <section className="tool-view" hidden={tool!=='meetings'}><MeetingPanel/></section>
        <section className="tool-view" hidden={tool!=='memory'}><MemoryPanel/></section>
      </ChatWorkspace>;
}
