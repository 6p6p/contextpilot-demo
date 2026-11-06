import {createHmac,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Env} from '../config/env.js';
import {PublicError} from '../errors.js';
const digest=(s:string)=>createHash('sha256').update(s).digest();
const signature=(key:string,body:string)=>createHmac('sha256',key).update(`demo:${body}`).digest('base64url');
// Legacy local installations can reuse their existing secret for ONE full-site login.
// An explicit DEMO_ACCESS_KEY always wins; a legacy PPT cookie never grants Demo access.
export const demoAccessKey=(env:Env)=>env.DEMO_ACCESS_KEY||env.PPT_ACCESS_KEY;
export function hasDemoAccess(env:Env,request:Pick<FastifyRequest,'headers'>){
 const key=demoAccessKey(env);if(!key)return false;
 const cookie=(request.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('cp_demo='))?.slice(8)??'';
 if(!/^\d{13}\.[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{43}$/.test(cookie))return false;
 const [expiry,nonce,tag]=cookie.split('.');
 return Number(expiry)>Date.now()&&Number(expiry)<=Date.now()+8*3600000&&timingSafeEqual(digest(tag),digest(signature(key,`${expiry}.${nonce}`)));
}
export function registerDemoAccess(app:FastifyInstance,env:Env){
 if((env.NODE_ENV==='production'||!['127.0.0.1','localhost','::1'].includes(env.HOST))&&!env.DEMO_ACCESS_KEY)throw new Error('Public Demo requires DEMO_ACCESS_KEY');
 const key=demoAccessKey(env);
 let loginWindow=0,logins=0,requestWindow=0,requests=0,mutationWindow=0,mutations=0,uploadWindow=0,uploads=0;
 const cookie=(value:string,seconds:number)=>`cp_demo=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${env.NODE_ENV==='production'?'; Secure':''}`;
 const checkOrigin=(r:FastifyRequest)=>{if(r.headers.origin){let valid=false;try{valid=new URL(r.headers.origin).host===r.headers.host;}catch{}if(!valid)throw new PublicError(403,'DEMO_ORIGIN_REJECTED','请从当前 Demo 页面提交操作。');}};
 app.addHook('onRequest',async(r,reply)=>{
  if(!key)return;
  const path=r.url.split('?')[0];
  if(path==='/api/demo-session'||path==='/api/health'||path==='/api/ready'||!path.startsWith('/api'))return;
  reply.header('cache-control','no-store');
  if(!hasDemoAccess(env,r))throw new PublicError(401,'DEMO_ACCESS_REQUIRED','请先输入 Demo 访问口令。');
  const now=Date.now();if(now-requestWindow>=60000){requests=0;requestWindow=now;}if(++requests>env.DEMO_API_PER_MINUTE)throw new PublicError(429,'DEMO_REQUEST_LIMIT','请求过于频繁，请稍后再试。');
  if(!['GET','HEAD','OPTIONS'].includes(r.method)){
   checkOrigin(r);if(now-mutationWindow>=60000){mutations=0;mutationWindow=now;}if(++mutations>env.DEMO_WRITES_PER_MINUTE)throw new PublicError(429,'DEMO_WRITE_LIMIT','操作次数已达每分钟上限。');
   if(r.method==='POST'&&['/api/documents','/api/meetings'].includes(path)){
    if(now-uploadWindow>=3600000){uploads=0;uploadWindow=now;}if(++uploads>env.DEMO_UPLOADS_PER_HOUR)throw new PublicError(429,'DEMO_UPLOAD_LIMIT','上传次数已达本小时上限。');
   }
  }
 });
 app.get('/api/demo-session',async(r,reply)=>{reply.header('cache-control','no-store');return {required:Boolean(key),authenticated:hasDemoAccess(env,r)};});
 app.post('/api/demo-session',async(r,reply)=>{
  checkOrigin(r);if(!key)throw new PublicError(503,'DEMO_ACCESS_UNCONFIGURED','Demo 口令未配置。');
  if(Date.now()-loginWindow>=60000){loginWindow=Date.now();logins=0;}if(++logins>5)throw new PublicError(429,'DEMO_LOGIN_LIMIT','口令尝试过多，请稍后再试。');
  const {accessKey}=z.object({accessKey:z.string().max(128)}).strict().parse(r.body);
  if(!timingSafeEqual(digest(accessKey),digest(key)))throw new PublicError(401,'DEMO_ACCESS_REQUIRED','访问口令错误。');
  const body=`${Date.now()+8*3600000}.${randomBytes(18).toString('base64url')}`;
  reply.header('cache-control','no-store').header('set-cookie',cookie(`${body}.${signature(key,body)}`,28800));return {authenticated:true};
 });
 app.delete('/api/demo-session',async(r,reply)=>{checkOrigin(r);reply.header('set-cookie',[cookie('',0),'cp_ppt=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0'+(env.NODE_ENV==='production'?'; Secure':'')]);return {authenticated:false};});
}
