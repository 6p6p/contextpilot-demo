// Local compiled-server simulation only. Never load root .env or call business providers.
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,mkdir,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=process.cwd();await mkdir('test-results',{recursive:true});
const cwd=await mkdtemp(resolve('test-results','production-smoke-'));
await cp(resolve('dist/web'),join(cwd,'dist/web'),{recursive:true});
const key='synthetic-smoke-only-access-key-1234567890';
const base={...process.env,EMAIL_FROM:'',EMAIL_ALLOWED_RECIPIENTS:'',EMAIL_TEST_ACCOUNT_ADDRESS:'',RESEND_DOMAIN_ID:'',EMAIL_MODE:'test',NODE_ENV:'production',HOST:'0.0.0.0',DOTENV_CONFIG_PATH:'.nonexistent-offline-env',DATABASE_URL:'',DATABASE_CA_CERT:'',PPT_ACCESS_KEY:'',DEMO_ACCESS_KEY:key,EMAIL_DELIVERY_ENABLED:'false',LLM_API_KEY:'',EMBEDDING_API_KEY:'',TAVILY_API_KEY:'',SUPABASE_STORAGE_KEY:'',RESEND_API_KEY:'',LOG_LEVEL:'info'};
const configured={...base,DATABASE_URL:'postgresql://synthetic:placeholder@127.0.0.1:1/unreachable',LLM_BASE_URL:'https://model.invalid/v1',LLM_MODEL:'synthetic',LLM_API_KEY:'synthetic-provider-key',SUPABASE_URL:'https://storage.invalid',SUPABASE_STORAGE_KEY:'synthetic-provider-key',SUPABASE_STORAGE_BUCKET:'synthetic-private',EMBEDDING_BASE_URL:'https://embedding.invalid/v1',EMBEDDING_MODEL:'synthetic',EMBEDDING_DIMENSIONS:'3',EMBEDDING_API_KEY:'synthetic-provider-key',TAVILY_API_KEY:'synthetic-provider-key'};
for(const [env,expected] of [[base,1],[configured,0]]){
 const r=spawnSync(process.execPath,[resolve('dist/server/apps/api/src/config/check-deployment.js')],{cwd,env,encoding:'utf8',windowsHide:true});
 if(r.status!==expected||r.stdout.includes(key)||r.stdout.includes('synthetic-provider-key'))throw new Error('Unsafe configuration presence check');
}
async function launch(extra){
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn(process.execPath,[resolve('dist/server/apps/api/src/server.js')],{cwd,env:{...base,PORT:String(port),...extra},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
 return {child,port,getLogs:()=>logs};
}
async function stop(child){if(child.exitCode!==null||child.signalCode!==null)return;const ended=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),10000);try{await ended;}finally{clearTimeout(timer);}}
const failures = [
 [{DEMO_ACCESS_KEY:''},'environment',['DEMO_ACCESS_KEY']],
 [{EMAIL_DELIVERY_ENABLED:'true'},'environment',['RESEND_API_KEY','EMAIL_FROM','EMAIL_ALLOWED_RECIPIENTS']],
 [{PORT:'bad'},'environment',['PORT']],
 [{EMAIL_DELIVERY_ENABLED:'true',RESEND_API_KEY:'synthetic-provider-key',EMAIL_FROM:'sender@example.invalid'},'environment',['EMAIL_ALLOWED_RECIPIENTS']],
 [{DATABASE_URL:'postgresql://synthetic:placeholder@db.example.invalid/demo',DATABASE_SSL:'false'},'environment',['DATABASE_URL','DATABASE_SSL']],
 [{DATABASE_URL:'postgresql://synthetic:placeholder@127.0.0.1/demo?sslmode=disable'},'environment',['DATABASE_URL']],
 [{DATABASE_URL:'postgresql://synthetic:placeholder@127.0.0.1/demo',DATABASE_CA_CERT:'synthetic-private-marker/nonexistent.crt'},'application',['DATABASE_CA_CERT']],
];
for(const [extra,stage,fields] of failures){
 const {child,getLogs}=await launch(extra);const timer=setTimeout(()=>child.kill('SIGKILL'),10000);const [code]=await once(child,'exit');clearTimeout(timer);
 const logs=getLogs();const diagnostic=logs.split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(row=>row?.event==='startup_failed');
 if(code!==1||!diagnostic||diagnostic.stage!==stage||JSON.stringify(diagnostic.fields)!==JSON.stringify(fields)||logs.includes(key)||logs.includes('synthetic-private-marker')||logs.includes('synthetic-provider-key')||logs.includes('postgresql://'))throw new Error('Unsafe or missing startup diagnostic');
}
// Real bind failure must be diagnosed without relying on port number or raw message.
const occupied=createServer();await new Promise(r=>occupied.listen(0,'0.0.0.0',r));
try{
 const {child,getLogs}=await launch({PORT:String(occupied.address().port)});const timer=setTimeout(()=>child.kill('SIGKILL'),10000);const [code]=await once(child,'exit');clearTimeout(timer);
 if(code!==1||!getLogs().includes('"stage":"listen"')||!getLogs().includes('"code":"EADDRINUSE"'))throw new Error('Missing bind failure diagnostic');
}finally{await new Promise(r=>occupied.close(r));}
const startupPaths=[
 {DATABASE_URL:'',DATABASE_SSL:'true'},
 {DATABASE_URL:'postgresql://synthetic:placeholder@127.0.0.1:1/unreachable',DATABASE_SSL:'false'},
 {DATABASE_URL:'postgresql://synthetic:placeholder@127.0.0.1:1/unreachable',DATABASE_SSL:'true',DATABASE_CA_CERT:resolve('dist/server/certs/prod-ca-2021.crt'),EMAIL_DELIVERY_ENABLED:'true',RESEND_API_KEY:'synthetic-provider-key',EMAIL_FROM:'onboarding@resend.dev',EMAIL_ALLOWED_RECIPIENTS:'owner@example.invalid',EMAIL_TEST_ACCOUNT_ADDRESS:'owner@example.invalid'},
];
for(const path of startupPaths){
 const {child,port,getLogs}=await launch({...path,DEMO_API_PER_MINUTE:'2'});const url=`http://127.0.0.1:${port}`;
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(`${url}/api/health`)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
  if(!ready||(await fetch(`${url}/api/ready`)).status!==503)throw new Error('Readiness incorrectly claims DB available');
  const secret='synthetic-query-value';if((await fetch(`${url}/api/conversations?token=${secret}`)).status!==401)throw new Error('Anonymous access');
  if((await fetch(`${url}/interview`,{headers:{accept:'text/html'}})).status!==200)throw new Error('SPA route failed');
  const r=await fetch(`${url}/api/demo-session`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accessKey:key})});
  const cookie=r.headers.get('set-cookie').split(';')[0];if(r.status!==200)throw new Error('Login failed');
  const headers={cookie};await fetch(`${url}/api/conversations`,{headers});await fetch(`${url}/api/conversations`,{headers});
  if((await fetch(`${url}/api/conversations`,{headers})).status!==429)throw new Error('No request limit');
  await stop(child);if(getLogs().includes(key)||getLogs().includes(cookie)||getLogs().includes(secret))throw new Error('Sensitive request logging');
 }finally{await stop(child);}
}
console.log(JSON.stringify({configurationPresenceChecks:2,startupFailureCases:failures.length+1,configuredEmailEnabledStartup:true,strictTlsCaStartup:true,unconfiguredAndUnreachableDatabase:true,readiness503:true,compiledSpa:true,auth:true,requestLimit:true,logsSanitized:true,localBusinessPersistence:false,externalBusinessCalls:0}));
