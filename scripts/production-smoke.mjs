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
const base={...process.env,NODE_ENV:'production',HOST:'0.0.0.0',DOTENV_CONFIG_PATH:'.nonexistent-offline-env',DATABASE_URL:'',DATABASE_CA_CERT:'',PPT_ACCESS_KEY:'',DEMO_ACCESS_KEY:key,EMAIL_DELIVERY_ENABLED:'false',LLM_API_KEY:'',EMBEDDING_API_KEY:'',TAVILY_API_KEY:'',SUPABASE_STORAGE_KEY:'',RESEND_API_KEY:'',LOG_LEVEL:'info'};
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
for(const extra of [{DEMO_ACCESS_KEY:''},{EMAIL_DELIVERY_ENABLED:'true'},{PORT:'bad'}]){
 const {child,getLogs}=await launch(extra);const timer=setTimeout(()=>child.kill('SIGKILL'),10000);const [code]=await once(child,'exit');clearTimeout(timer);
 if(code!==1||!getLogs().includes('Startup failed')||getLogs().includes(key))throw new Error('Unsafe startup behavior');
}
for(const database of ['', 'postgresql://synthetic:placeholder@127.0.0.1:1/unreachable']){
 const {child,port,getLogs}=await launch({DATABASE_URL:database,DATABASE_SSL:'false',DEMO_API_PER_MINUTE:'2'});const url=`http://127.0.0.1:${port}`;
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
console.log(JSON.stringify({configurationPresenceChecks:2,startupFailureCases:3,unconfiguredAndUnreachableDatabase:true,readiness503:true,compiledSpa:true,auth:true,requestLimit:true,logsSanitized:true,localBusinessPersistence:false,externalBusinessCalls:0}));
