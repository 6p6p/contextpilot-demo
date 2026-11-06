import {useEffect,useState} from 'react';
import {presentationListSchema,type PresentationJob} from '../../../shared/presentations';
import {Icon} from './Icon';
const labels={queued:'等待生成',planning:'正在规划',rendering:'正在生成文件',ready:'已完成',failed:'生成失败'};
export function PresentationCard({job,onRetry,requestTitle}:{job:PresentationJob;onRetry?:()=>void;requestTitle?:string}){
 const quoted=requestTitle?.match(/[《「“]([^》」”]+)[》」”]/)?.[1];
 const title=quoted??requestTitle?.replace(/^(?:请)?(?:根据[^，。]*[，,])?(?:生成|制作)(?:一份)?\s*\d*\s*页?\s*(?:中文)?\s*/,'').replace(/(?:PPT|演示文稿).*$/i,'').trim();
 const fileTitle=job.filename.replace(/\.pptx$/i,'');
 const heading=title||(fileTitle.match(/^[\da-f-]{32,}$|^ContextPilot-|^UI-STUB-/i)?'演示文稿':fileTitle);
 return <section className="presentation-card" aria-label="PPT 任务" data-presentation-id={job.id}><div className="file-icon"><Icon name="slides"/></div><div className="file-body"><strong title={heading}>{heading}</strong><p role="status">PPTX · {job.pageCount} 页 · {labels[job.status]}</p>{job.status==='ready'?<a href={`/api/presentations/${job.id}/download`}>下载 PPTX</a>:null}{job.errorCode?<p role="alert">{job.errorMessage||'文件未能生成，请检查资料或稍后重试。'}</p>:null}{job.status==='failed'&&job.retries<1&&onRetry?<button type="button" onClick={onRetry}>重试生成（可能产生API费用）</button>:null}<details className="file-details"><summary>文件详情</summary><span>{job.filename}</span>{job.errorCode?<span>错误代码：{job.errorCode}</span>:null}</details></div></section>;
}
export function PresentationPanel({refresh,visible=true}:{refresh:number;visible?:boolean}){
 const [jobs,setJobs]=useState<PresentationJob[]>([]),[error,setError]=useState('');
 useEffect(()=>{if(!visible)return;const c=new AbortController();let timer:ReturnType<typeof setTimeout>;
 async function load(){try{const r=await fetch('/api/presentations',{signal:c.signal});const d=await r.json();if(!r.ok)throw Error(d.error?.message??'PPT历史加载失败');if(c.signal.aborted)return;setJobs(presentationListSchema.parse(d).presentations);setError('');timer=setTimeout(()=>{void load();},3000);}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'加载失败');}}
 void load();return()=>{c.abort();clearTimeout(timer);};},[refresh,visible]);
 return <section hidden={!visible} className="tool-view" aria-label="PPT 历史文件"><h2>PPT 历史文件</h2><p>在对话中输入生成指令；使用输入框旁的 + 选择可选资料。</p>{error?<p role="alert">{error}</p>:null}{!jobs.length&&!error?<p>暂无生成文件。</p>:jobs.map(job=><PresentationCard key={job.id} job={job}/>)}</section>;
}
