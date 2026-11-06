import { useContext, useEffect, useRef, useState } from 'react';
import { DemoSessionContext } from './DemoAccess';
import { presentationListSchema, type PresentationContext, type PresentationJob } from '../../../shared/presentations';
interface Props { context:PresentationContext; onChange:(value:PresentationContext)=>void; refresh:number;openRequested?:boolean }
const labels={queued:'等待规划',planning:'正在规划',rendering:'正在生成文件',ready:'已完成',failed:'失败'};
export function PresentationPanel({context,onChange,refresh,openRequested}:Props) {
  const [expanded,setExpanded]=useState(false);const newest=useRef<string|null>(null),initialJobsLoaded=useRef(false);
  const [key,setKey]=useState('');const [unlocked,setUnlocked]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const demoAccess=useContext(DemoSessionContext);
  useEffect(()=>{if(openRequested)setExpanded(true);},[openRequested]);
  const [jobs,setJobs]=useState<PresentationJob[]>([]);const [meetings,setMeetings]=useState<{id:string;filename:string}[]>([]);const [revision,setRevision]=useState(0);
  async function api(path:string,options?:RequestInit){const response=await fetch(`/api${path}`,options);const data=await response.json();if(!response.ok)throw new Error(data.error?.message??'PPT 请求失败');return data;}
  useEffect(()=>{const c=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function load(){try{const data=presentationListSchema.parse(await api('/presentations',{signal:c.signal}));if(c.signal.aborted)return;const latest=data.presentations[0]?.id??null;if(initialJobsLoaded.current&&latest&&latest!==newest.current)setExpanded(true);newest.current=latest;initialJobsLoaded.current=true;setJobs(data.presentations);setUnlocked(true);setError('');if(data.presentations.some(j=>!['ready','failed'].includes(j.status)))timer=setTimeout(()=>{void load();},2000);}catch(cause){if(!c.signal.aborted){setUnlocked(false);setJobs([]);setError(cause instanceof Error?cause.message:'PPT 历史加载失败');}}}
    void load();return()=>{c.abort();clearTimeout(timer);};
  },[refresh,revision]);
  useEffect(()=>{const c=new AbortController();void api('/meetings',{signal:c.signal}).then(data=>{if(!c.signal.aborted)setMeetings(data.meetings.filter((m:{status:string})=>m.status==='ready'));}).catch(()=>{});return()=>c.abort();},[refresh,revision]);
  async function unlock(event:React.FormEvent){event.preventDefault();setBusy(true);try{await api('/presentation-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accessKey:key})});setKey('');setRevision(v=>v+1);}catch(cause){setError(cause instanceof Error?cause.message:'解锁失败');}finally{setBusy(false);}}
  async function retry(id:string){setBusy(true);try{await api(`/presentations/${id}/retry`,{method:'POST'});setRevision(v=>v+1);}catch(cause){setError(cause instanceof Error?cause.message:'重试失败');}finally{setBusy(false);}}
  return <section className="presentation-panel" aria-label="PPT 资料与下载"><details open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>PPT 资料与下载 · 在聊天中明确输入“生成 5 页 PPT” {jobs.length?`· ${jobs.some(j=>!['ready','failed'].includes(j.status))?'生成中':`${jobs.length}份文件`}`:''}</summary>
    {demoAccess?<p>PPT 使用当前 Demo 访问权限。</p>:!unlocked?<form onSubmit={e=>{void unlock(e);}}><label>PPT 访问口令<input type="password" aria-label="PPT 访问口令" value={key} maxLength={128} autoComplete="off" onChange={e=>setKey(e.target.value)}/></label><button disabled={busy||key.length<32}>解锁 PPT</button></form>:<p>已解锁 PPT 生成与下载 <button type="button" onClick={()=>{void api('/presentation-session',{method:'DELETE'}).then(()=>{setUnlocked(false);setJobs([]);});}}>锁定</button></p>}
    {error?<p role="alert">{error}</p>:null}
    <p>总计 5–10 页，含封面及参考资料。来源不足会标明缺口，不补造进度、负责人或数据。</p>
    <label>PPT 引用会议<select aria-label="PPT 引用会议" value={context.meetingId??''} onChange={e=>onChange({...context,meetingId:e.target.value||null})}><option value="">不引用会议（提及“这次会议”时必须选择）</option>{meetings.map(m=><option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>
    <label><input type="checkbox" checked={context.useMemory} onChange={e=>onChange({...context,useMemory:e.target.checked})}/> PPT 检索长期记忆</label>
    <label>PPT 公共搜索词（仅需最新外部资料时填写）<input aria-label="PPT 公共搜索词" value={context.webQuery??''} maxLength={200} onChange={e=>onChange({...context,webQuery:e.target.value.trim()?e.target.value:null})}/></label>
    <p>PDF 来源使用下方知识库开关。公共搜索词不得包含内部会议、个人信息或 PDF 内容。</p>
    <button type="button" onClick={()=>setRevision(v=>v+1)}>刷新 PPT 记录</button>
    {!jobs.length&&unlocked?<p>尚无生成文件。请在对话中明确指定页数与资料。</p>:null}<ul className="presentation-list">{jobs.map(job=><li key={job.id} data-presentation-id={job.id}><strong>{job.filename}</strong><span>{labels[job.status]} · {job.pageCount} 页{job.size?` · ${Math.ceil(job.size/1024)} KB`:''}</span>{job.status==='ready'?<a href={`/api/presentations/${job.id}/download`}>下载 PPTX</a>:null}{job.errorCode?<p role="alert">{job.errorMessage}（{job.errorCode}）</p>:null}{job.status==='failed'&&job.retries<1?<button type="button" disabled={busy} onClick={()=>{void retry(job.id);}}>显式重试一次</button>:null}</li>)}</ul>
  </details></section>;
}
