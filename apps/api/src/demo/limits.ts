import type {Env} from '../config/env.js';
import {PublicError} from '../errors.js';
// Shared by foreground requests and every background adapter in this ONE process.
export function createDemoTransport(env:Env,transport:typeof fetch):typeof fetch{
 const stats={model:{total:0,minute:0,start:0,inflight:0},embedding:{total:0,minute:0,start:0,inflight:0},search:{total:0,minute:0,start:0,inflight:0}};
 return async(input,init)=>{
  if(!env.DEMO_ACCESS_KEY)return transport(input,init);
  const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url).pathname;
  const kind=path.endsWith('/chat/completions')?'model':path.endsWith('/embeddings')?'embedding':path.endsWith('/search')?'search':null;
  if(!kind)return transport(input,init);
  const limit=kind==='model'?env.DEMO_MODEL_CALLS:kind==='embedding'?env.DEMO_EMBEDDING_CALLS:env.DEMO_SEARCH_CALLS;
  const perMinute=kind==='model'?10:kind==='embedding'?30:5,concurrency=kind==='model'?3:kind==='embedding'?2:1;
  const s=stats[kind],now=Date.now();if(now-s.start>=60000){s.start=now;s.minute=0;}
  if(s.total>=limit||s.minute>=perMinute||s.inflight>=concurrency)throw new PublicError(429,'DEMO_AI_LIMIT','演示服务调用达到上限，请稍后再试或联系演示者。');
  if(typeof init?.body!=='string'||Buffer.byteLength(init.body)>262144)throw new PublicError(413,'DEMO_AI_INPUT_LIMIT','单次资料过长，请减少输入。');
  s.total++;s.minute++;s.inflight++;
  try{
   const response=await transport(input,init);const reader=response.body?.getReader();const chunks:Uint8Array[]=[];let bytes=0;
   if(reader)try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>4*1024*1024)throw new PublicError(502,'DEMO_AI_RESPONSE_LIMIT','上游响应超过演示上限。');chunks.push(part.value);}}finally{await reader.cancel();}
   const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
   return new Response([204,205,304].includes(response.status)?null:Buffer.concat(chunks),{status:response.status,statusText:response.statusText,headers});
  }finally{s.inflight--;}
 };
}
