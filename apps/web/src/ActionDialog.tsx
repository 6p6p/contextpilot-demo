import {useEffect,useRef,useState,type ReactNode} from 'react';
export function ActionDialog({open,title,description,children,onClose,onConfirm}:{open:boolean;title:string;description:string;children?:ReactNode;onClose:()=>void;onConfirm:()=>Promise<void>}){
 const ref=useRef<HTMLDialogElement>(null);const[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(open){setError('');if(!ref.current?.open)ref.current?.showModal();}else ref.current?.close();},[open]);
 return <dialog ref={ref} className="management-dialog" aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><form onSubmit={e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');void onConfirm().then(onClose).catch(c=>setError(c instanceof Error?c.message:'操作失败，请刷新确认状态。')).finally(()=>setBusy(false));}}>
  <h2>{title}</h2><p>{description}</p>{children}{error?<p role="alert">{error}</p>:null}<div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button disabled={busy}>{busy?'正在保存…':'确认'}</button></div>
 </form></dialog>;
}
