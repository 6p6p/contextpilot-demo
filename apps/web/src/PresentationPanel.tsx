import { useContext, useEffect, useRef, useState } from 'react';
import { DemoSessionContext } from './DemoAccess';
import { presentationListSchema, type PresentationContext, type PresentationJob } from '../../../shared/presentations';
interface Props { context:PresentationContext; onChange:(value:PresentationContext)=>void; refresh:number;openRequested?:boolean;onPrepare?:(request:string)=>void }
const labels={queued:'等待规划',planning:'正在规划',rendering:'正在生成文件',ready:'已完成',failed:'失败'};
export function PresentationPanel({context,onChange,refresh,openRequested,onPrepare}:Props) {
  const [expanded,setExpanded]=useState(false);const newest=useRef<string|null>(null),initialJobsLoaded=useRef(false);
  const [loaded,setLoaded]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [topic,setTopic]=useState(''),[pages,setPages]=useState(5);
  const [documents,setDocuments]=useState<{id:string;filename:string}[]>([]);
  const demoAccess=useContext(DemoSessionContext);
  useEffect(()=>{if(openRequested)setExpanded(true);},[openRequested]);
  const [jobs,setJobs]=useState<PresentationJob[]>([]);const [meetings,setMeetings]=useState<{id:string;filename:string}[]>([]);const [revision,setRevision]=useState(0);
  async function api(path:string,options?:RequestInit){const response=await fetch(`/api${path}`,options);const data=await response.json();if(!response.ok)throw new Error(data.error?.message??'PPT 请求失败');return data;}
  useEffect(()=>{const c=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function load(){try{const data=presentationListSchema.parse(await api('/presentations',{signal:c.signal}));if(c.signal.aborted)return;const latest=data.presentations[0]?.id??null;if(initialJobsLoaded.current&&latest&&latest!==newest.current)setExpanded(true);newest.current=latest;initialJobsLoaded.current=true;setJobs(data.presentations);setLoaded(true);setError('');if(data.presentations.some(j=>!['ready','failed'].includes(j.status)))timer=setTimeout(()=>{void load();},2000);}catch(cause){if(!c.signal.aborted){setLoaded(false);setError(cause instanceof Error?cause.message:'PPT 历史加载失败');}}}
    void load();return()=>{c.abort();clearTimeout(timer);};
  },[refresh,revision]);
  useEffect(()=>{const c=new AbortController();void api('/meetings',{signal:c.signal}).then(data=>{if(!c.signal.aborted)setMeetings(data.meetings.filter((m:{status:string})=>m.status==='ready'));}).catch(()=>{});return()=>c.abort();},[refresh,revision]);
  useEffect(()=>{const c=new AbortController();void api('/documents',{signal:c.signal}).then(data=>{if(!c.signal.aborted)setDocuments(data.documents.filter((d:{status:string})=>d.status==='ready'));}).catch(()=>{});return()=>c.abort();},[refresh,revision]);
  async function retry(id:string){setBusy(true);try{await api(`/presentations/${id}/retry`,{method:'POST'});setRevision(v=>v+1);}catch(cause){setError(cause instanceof Error?cause.message:'重试失败');}finally{setBusy(false);}}
  return <section className="presentation-panel" aria-label="PPT 资料与下载"><details open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>PPT 资料与下载 · 在聊天中明确输入“生成 5 页 PPT” {jobs.length?`· ${jobs.some(j=>!['ready','failed'].includes(j.status))?'生成中':`${jobs.length}份文件`}`:''}</summary>
    <p>{demoAccess?'使用当前 Demo 登录，生成与私有下载无需再次验证。':'生成与下载需要有效的 Demo 登录；本地请配置统一 Demo 访问认证。'}</p>
    {error?<p role="alert">{error}</p>:null}
    <p>总计 5–10 页，含封面及参考资料。来源不足会标明缺口，不补造进度、负责人或数据。</p>
    <label>主题<input aria-label="PPT 主题" value={topic} maxLength={200} placeholder="团队沟通培训" onChange={e=>setTopic(e.target.value)}/></label>
    <label>总页数<select aria-label="PPT 页数" value={pages} onChange={e=>setPages(Number(e.target.value))}>{[5,6,7,8,9,10].map(n=><option key={n} value={n}>{n} 页</option>)}</select></label>
    <fieldset><legend>可选资料来源（默认不使用历史资料）</legend>
    <label><input type="checkbox" checked={Boolean(context.useChat)} onChange={e=>onChange({...context,useChat:e.target.checked})}/> 使用当前会话用户陈述</label>
    <label>PPT PDF 资料<select multiple aria-label="PPT PDF 资料" value={context.documentIds??[]} onChange={e=>onChange({...context,documentIds:Array.from(e.target.selectedOptions,o=>o.value)})}>{documents.map(d=><option key={d.id} value={d.id}>{d.filename}</option>)}</select></label>
    <button type="button" onClick={()=>onChange({...context,documentIds:[]})}>清空 PPT PDF 选择</button>
    <label>PPT 引用会议<select aria-label="PPT 引用会议" value={context.meetingId??''} onChange={e=>onChange({...context,meetingId:e.target.value||null})}><option value="">不引用会议</option>{meetings.map(m=><option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>
    <label><input type="checkbox" checked={context.useMemory} onChange={e=>onChange({...context,useMemory:e.target.checked})}/> PPT 检索长期记忆</label>
    <label>PPT 公共搜索词（仅需最新外部资料时填写）<input aria-label="PPT 公共搜索词" value={context.webQuery??''} maxLength={200} onChange={e=>onChange({...context,webQuery:e.target.value.trim()?e.target.value:null})}/></label>
    </fieldset><p>普通主题可不选资料。仅使用选中 PDF 与会议的最新风险、人工待办；忽略项不进入新汇报。公共搜索词不得包含私有内容。</p>
    <button type="button" disabled={!topic.trim()||!onPrepare} onClick={()=>onPrepare?.(`生成 ${pages} 页${topic.trim()} PPT。`)}>填入生成指令</button><small>可继续在消息框补充要求，点击发送后才开始生成。</small>
    <button type="button" onClick={()=>setRevision(v=>v+1)}>刷新 PPT 记录</button>
    {!jobs.length&&loaded?<p>尚无生成文件。请在对话中明确指定页数与资料。</p>:null}<ul className="presentation-list">{jobs.map(job=><li key={job.id} data-presentation-id={job.id}><strong>{job.filename}</strong><span>{labels[job.status]} · {job.pageCount} 页{job.size?` · ${Math.ceil(job.size/1024)} KB`:''}</span>{job.status==='ready'?<a href={`/api/presentations/${job.id}/download`}>下载 PPTX</a>:null}{job.errorCode?<p role="alert">{job.errorMessage}（{job.errorCode}）</p>:null}{job.status==='failed'&&job.retries<1?<button type="button" disabled={busy} onClick={()=>{void retry(job.id);}}>显式重试一次</button>:null}</li>)}</ul>
  </details></section>;
}
