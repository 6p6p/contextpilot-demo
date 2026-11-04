import {useEffect,useState,useRef,type ReactNode} from 'react';
export function DemoAccess({children}:{children:ReactNode}){
 const [state,setState]=useState<'checking'|'locked'|'open'|'local'>('checking');
 const [key,setKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const revision=useRef(0);
 useEffect(()=>{
  const controller=new AbortController();
  async function check(){const current=revision.current;try{const r=await fetch('/api/demo-session',{signal:controller.signal});if(!r.ok)throw new Error();const d=await r.json();if(!controller.signal.aborted&&current===revision.current){setState(!d.required?'local':d.authenticated?'open':'locked');setError('');}}catch{if(!controller.signal.aborted&&current===revision.current)setError('无法验证访问状态，请检查服务后刷新。');}}
  void check();const timer=setInterval(()=>{void check();},60000);
  return()=>{controller.abort();clearInterval(timer);};
 },[]);
 async function login(e:React.FormEvent){e.preventDefault();revision.current++;setBusy(true);setError('');try{
  const r=await fetch('/api/demo-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accessKey:key})});const d=await r.json();
  if(!r.ok)throw new Error(d.error?.message??'验证失败');setState('open');
 }catch(cause){setError(cause instanceof Error?cause.message:'验证失败');}finally{setKey('');setBusy(false);}}
 async function logout(){revision.current++;setBusy(true);try{const r=await fetch('/api/demo-session',{method:'DELETE'});if(!r.ok)throw new Error();setState('locked');setError('');}catch{setError('退出失败，请刷新重试。');}finally{setBusy(false);}}
 if(state==='checking'||state==='locked')return <main className="demo-login"><h1>ContextPilot Demo</h1><p>请输入演示者提供的访问口令。</p>{state==='locked'?<form onSubmit={e=>{void login(e);}}><label htmlFor="demo-key">Demo 访问口令</label><input id="demo-key" type="password" value={key} maxLength={128} autoComplete="current-password" onChange={e=>setKey(e.target.value)}/><button disabled={busy||!key}>进入 Demo</button></form>:<p role="status">正在验证访问状态…</p>}{error?<p role="alert">{error}</p>:null}</main>;
 return <>{state==='open'?<div className="demo-session"><span>受保护的演示工作区</span><button disabled={busy} onClick={()=>{void logout();}}>退出 Demo</button>{error?<p role="alert">{error}</p>:null}</div>:null}{children}</>;
}
