import {describe,it,expect,vi} from 'vitest';
import {buildApp} from '../../apps/api/src/app.js';
import {parseEnv} from '../../apps/api/src/config/env.js';
import {createDemoTransport} from '../../apps/api/src/demo/limits.js';
import {hasDemoAccess} from '../../apps/api/src/demo/access.js';
import {createPresentationAuth} from '../../apps/api/src/presentations/auth.js';
const key='synthetic-demo-only-password-123456789';
const env=parseEnv({NODE_ENV:'test',DEMO_ACCESS_KEY:key});
async function login(app:ReturnType<typeof buildApp>){const r=await app.inject({method:'POST',url:'/api/demo-session',payload:{accessKey:key}});expect(r.statusCode).toBe(200);return String(r.headers['set-cookie']).split(';')[0];}
describe('Demo service-side boundary, all external services absent',()=>{
 it('blocks anonymous APIs including uploads/downloads/AI before body parsing or service lookup',async()=>{
  const app=buildApp(env);try{
   for(const [method,url] of [['GET','/api/conversations'],['GET','/api/memories'],['GET','/api/documents/x/download'],['GET','/api/presentations/x/download'],['POST','/api/documents'],['POST','/api/meetings'],['POST','/api/conversations/x/messages'],['POST','/api/email-drafts/x/send']]){
    expect((await app.inject({method:method as 'GET'|'POST',url})).statusCode).toBe(401);
   }
   expect((await app.inject('/api/health')).statusCode).toBe(200);expect((await app.inject('/api/ready')).statusCode).toBe(503);
  }finally{await app.close();}
 });
 it('session signature/expiry/tamper checks, same-origin writes and shared PPT access',async()=>{
  const app=buildApp(env);try{const cookie=await login(app);
   expect(hasDemoAccess(env,{headers:{cookie}})).toBe(true);expect(hasDemoAccess(env,{headers:{cookie:cookie+'x'}})).toBe(false);
   expect(hasDemoAccess({...env,DEMO_ACCESS_KEY:key+'x'},{headers:{cookie}})).toBe(false);
   expect(()=>createPresentationAuth(env).require({headers:{cookie}})).not.toThrow();
   expect((await app.inject({url:'/api/conversations',headers:{cookie}})).statusCode).toBe(503);
   expect((await app.inject({method:'POST',url:'/api/conversations',headers:{cookie,origin:'https://attacker.invalid'},payload:{title:'x'}})).statusCode).toBe(403);
   vi.spyOn(Date,'now').mockReturnValue(Date.now()+9*3600000);expect(hasDemoAccess(env,{headers:{cookie}})).toBe(false);vi.restoreAllMocks();
   const r=await app.inject({method:'DELETE',url:'/api/demo-session',headers:{cookie}});expect(String(r.headers['set-cookie'])).toContain('Max-Age=0');
  }finally{vi.restoreAllMocks();await app.close();}
 });
 it('enforces server-wide upload and mutation attempt limits',async()=>{
  const app=buildApp({...env,DEMO_UPLOADS_PER_HOUR:1,DEMO_WRITES_PER_MINUTE:2});try{const cookie=await login(app);
   expect((await app.inject({method:'POST',url:'/api/documents?filename=x.pdf',headers:{cookie,'content-type':'application/pdf'},payload:Buffer.from('%PDF-')})).statusCode).toBe(503);
   expect((await app.inject({method:'POST',url:'/api/documents?filename=x.pdf',headers:{cookie,'content-type':'application/pdf'},payload:Buffer.from('%PDF-')})).statusCode).toBe(429);
   expect((await app.inject({method:'POST',url:'/api/conversations',headers:{cookie},payload:{title:'x'}})).json().error.code).toBe('DEMO_WRITE_LIMIT');
  }finally{await app.close();}
 });
 it('checks authenticated file body size before persistence',async()=>{
  const app=buildApp(env);try{const cookie=await login(app);
   expect((await app.inject({method:'POST',url:'/api/documents?filename=x.pdf',headers:{cookie,'content-type':'application/pdf'},payload:Buffer.alloc(6*1024*1024+1)})).statusCode).toBe(413);
   expect((await app.inject({method:'POST',url:'/api/meetings?filename=x.txt',headers:{cookie,'content-type':'text/plain'},payload:Buffer.alloc(1024*1024+1)})).statusCode).toBe(413);
  }finally{await app.close();}
 });
 it('GET polling is capped and a legacy PPT cookie cannot bypass the Demo gate',async()=>{
  const app=buildApp({...env,DEMO_API_PER_MINUTE:1});try{const cookie=await login(app);
   expect((await app.inject({url:'/api/presentations',headers:{cookie:'cp_ppt=synthetic-legacy-cookie'}})).statusCode).toBe(401);
   expect((await app.inject({url:'/api/conversations',headers:{cookie}})).statusCode).toBe(503);
   expect((await app.inject({url:'/api/memories',headers:{cookie}})).json().error.code).toBe('DEMO_REQUEST_LIMIT');
  }finally{await app.close();}
 });
 it('production requires access key, forbids email and binds Railway PORT/host',()=>{
  expect(()=>parseEnv({NODE_ENV:'production'})).toThrow('DEMO_ACCESS_KEY');
  expect(()=>parseEnv({HOST:'0.0.0.0'})).toThrow('DEMO_ACCESS_KEY');
  expect(()=>parseEnv({NODE_ENV:'production',DEMO_ACCESS_KEY:key,EMAIL_DELIVERY_ENABLED:'true'})).toThrow('EMAIL_DELIVERY_ENABLED');
  expect(parseEnv({NODE_ENV:'production',DEMO_ACCESS_KEY:key,PORT:'4567'})).toMatchObject({HOST:'0.0.0.0',PORT:4567,EMAIL_DELIVERY_ENABLED:false});
 });
 it('global login attempts are bounded and production cookie is secure',async()=>{
  const app=buildApp({...env,NODE_ENV:'production',LOG_LEVEL:'silent'});try{
   const cookie=await login(app);expect(cookie).not.toContain(key);
   const r=await app.inject({method:'POST',url:'/api/demo-session',payload:{accessKey:key}});expect(String(r.headers['set-cookie'])).toContain('Secure');expect(String(r.headers['set-cookie'])).toContain('HttpOnly');
   for(let i=0;i<3;i++)await app.inject({method:'POST',url:'/api/demo-session',payload:{accessKey:'wrong'}});
   expect((await app.inject({method:'POST',url:'/api/demo-session',payload:{accessKey:key}})).statusCode).toBe(429);
  }finally{await app.close();}
 });
});
it('one process bounds all model/embedding/search attempts before transport',async()=>{
 const transport=vi.fn(async()=>new Response('{}'));const bounded=createDemoTransport({...env,DEMO_MODEL_CALLS:1,DEMO_EMBEDDING_CALLS:1,DEMO_SEARCH_CALLS:1},transport);
 for(const path of ['chat/completions','embeddings','search']){
  await bounded(`https://provider.invalid/${path}`,{body:'{}'});
  await expect(bounded(`https://provider.invalid/${path}`,{body:'{}'})).rejects.toMatchObject({code:'DEMO_AI_LIMIT'});
 }
 expect(transport).toHaveBeenCalledTimes(3);
 await expect(createDemoTransport(env,transport)('https://provider.invalid/chat/completions',{body:'x'.repeat(262145)})).rejects.toMatchObject({code:'DEMO_AI_INPUT_LIMIT'});
});
it('failed upstream attempts consume caps and in-flight model calls cannot exceed three',async()=>{
 const streams:ReadableStreamDefaultController<Uint8Array>[]=[];
 const transport=vi.fn(async()=>new Response(new ReadableStream<Uint8Array>({start(c){streams.push(c);}})));const bounded=createDemoTransport(env,transport);
 const args={body:'{}'};const jobs=Array.from({length:3},()=>bounded('https://provider.invalid/chat/completions',args));
 await new Promise(r=>setTimeout(r,0));
 await expect(bounded('https://provider.invalid/chat/completions',args)).rejects.toMatchObject({code:'DEMO_AI_LIMIT'});for(const stream of streams){stream.enqueue(new TextEncoder().encode('{}'));stream.close();}await Promise.all(jobs);expect(transport).toHaveBeenCalledTimes(3);
 const failed=vi.fn(async()=>{throw new Error('STUB timeout');});const once=createDemoTransport({...env,DEMO_MODEL_CALLS:1},failed);
 await expect(once('https://provider.invalid/chat/completions',args)).rejects.toThrow('STUB');await expect(once('https://provider.invalid/chat/completions',args)).rejects.toMatchObject({code:'DEMO_AI_LIMIT'});expect(failed).toHaveBeenCalledTimes(1);
});
