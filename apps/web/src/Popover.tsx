import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

// A portal keeps menus out of the history scroller; native buttons retain keyboard semantics.
export function Popover({label,trigger,children,className='',placement='bottom',menu=false,disabled=false,onOpenChange,resetKey}:{label:string;trigger:ReactNode;children:(close:()=>void)=>ReactNode;className?:string;placement?:'top'|'bottom';menu?:boolean;disabled?:boolean;onOpenChange?:(open:boolean)=>void;resetKey?:string|null}){
 const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0});
 const button=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),id=useId();
 const close=useCallback((restore=false)=>{setOpen(false);onOpenChange?.(false);if(restore)button.current?.focus();},[onOpenChange]);
 useEffect(()=>{close();},[resetKey,close]);
 useLayoutEffect(()=>{
  if(!open)return;
  const update=()=>{const b=button.current?.getBoundingClientRect(),p=panel.current;if(!b||!p)return;const h=p.offsetHeight,w=p.offsetWidth;const above=placement==='top'||b.bottom+h+8>innerHeight;setPosition({left:Math.max(8,Math.min(b.left,innerWidth-w-8)),top:Math.max(8,Math.min(above?b.top-h-8:b.bottom+8,innerHeight-h-8))});};
  update();if(menu)panel.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
  const outside=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!button.current?.contains(e.target as Node))close();};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  const observer=new ResizeObserver(update);if(panel.current)observer.observe(panel.current);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);observer.disconnect();};
 },[open,placement,menu,close]);
 return <><button ref={button} type="button" className={`icon-button ${className}`} title={label} aria-label={label} aria-haspopup={menu?'menu':'dialog'} aria-expanded={open} aria-controls={open?id:undefined} disabled={disabled} onClick={()=>{setOpen(v=>!v);onOpenChange?.(!open);}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);onOpenChange?.(true);}}}>{trigger}</button>{open?createPortal(<div id={id} ref={panel} role={menu?'menu':'dialog'} aria-label={label} className={`popover ${menu?'action-menu':'tool-popover'}`} style={position} onBlur={e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget as Node)&&e.relatedTarget!==button.current)close();}} onKeyDown={e=>{
  if(!menu||!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const items=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)'));const index=items.indexOf(document.activeElement as HTMLButtonElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
 }}>{children(()=>close(true))}</div>,document.body):null}</>;
}
