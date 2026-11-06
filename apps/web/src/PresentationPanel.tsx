import {useEffect,useState} from 'react';
import {presentationListSchema,type PresentationJob} from '../../../shared/presentations';
const labels={queued:'等待生成',planning:'正在规划',rendering:'正在生成文件',ready:'已完成',failed:'生成失败'};
export function PresentationCard({job,onRetry}:{job:PresentationJob;onRetry?:()=>void}){
 return <section className="presentation-card" aria-label="PPT 任务" data-presentation-id={job.id}><strong>{job.filename}</strong><p role="status">{labels[job.status]} · {job.pageCount} 页</p>{job.status==='ready'?<a href={`/api/presentations/${job.id}/download`}>下载 PPTX</a>:null}{job.errorCode?<p role="alert">{job.errorMessage}（{job.errorCode}）</p>:null}{job.status==='failed'&&job.retries<1&&onRetry?<button type="button" onClick={onRetry}>重试生成（可能产生API费用）</button>:null}</section>;
}
export function PresentationPanel({refresh,visible=true}:{refresh:number;visible?:boolean}){
 const [jobs,setJobs]=useState<PresentationJob[]>([]),[error,setError]=useState('');
 useEffect(()=>{if(!visible)return;const c=new AbortController();let timer:ReturnType<typeof setTimeout>;
 async function load(){try{const r=await fetch('/api/presentations',{signal:c.signal});const d=await r.json();if(!r.ok)throw Error(d.error?.message??'PPT历史加载失败');if(c.signal.aborted)return;setJobs(presentationListSchema.parse(d).presentations);setError('');timer=setTimeout(()=>{void load();},3000);}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'加载失败');}}
 void load();return()=>{c.abort();clearTimeout(timer);};},[refresh,visible]);
 return <section hidden={!visible} className="tool-view" aria-label="PPT 历史文件"><h2>PPT 历史文件</h2><p>在对话中输入生成指令；使用输入框旁的 + 选择可选资料。</p>{error?<p role="alert">{error}</p>:null}{!jobs.length&&!error?<p>暂无生成文件。</p>:jobs.map(job=><PresentationCard key={job.id} job={job}/>)}</section>;
}
