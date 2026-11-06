import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import {hasDemoAccess} from '../demo/access.js';
import { PublicError } from '../errors.js';
const digest=(s:string)=>createHash('sha256').update(s).digest();
export function createPresentationAuth(env:Env) {
  const signature=(s:string)=>createHmac('sha256',env.PPT_ACCESS_KEY!).update(`ppt:${env.PPT_SCOPE}:${s}`).digest('base64url');
  return {
    require(request:Pick<FastifyRequest,'headers'>) {
      if(hasDemoAccess(env,request))return;
      if(!env.PPT_ACCESS_KEY)throw new PublicError(503,'PPT_ACCESS_NOT_CONFIGURED','请配置统一 DEMO_ACCESS_KEY，并通过全站 Demo 登录后使用 PPT。');
      const cookie=(request.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('cp_ppt='))?.slice(7)??'';
      const [expires,nonce,tag]=cookie.split('.');
      const body=`${expires}.${nonce}`;
      if(!/^\d{13}\.[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{43}$/.test(cookie)||Number(expires)<Date.now()||Number(expires)>Date.now()+8*3600000||!timingSafeEqual(digest(tag),digest(signature(body))))throw new PublicError(401,'PPT_ACCESS_REQUIRED','请重新登录全站 Demo 后访问 PPT。');
    },
    register(app:FastifyInstance) {
      let failures=0,window=Date.now();
      app.post('/api/presentation-session',async(request,reply)=>{
        if(!env.PPT_ACCESS_KEY)throw new PublicError(503,'PPT_ACCESS_NOT_CONFIGURED','尚未配置 PPT_ACCESS_KEY。');
        if(Date.now()-window>60000){window=Date.now();failures=0;}
        if(failures>=5)throw new PublicError(429,'PPT_ACCESS_RATE_LIMITED','访问口令尝试过多，请稍后重试。');
        const {accessKey}=z.object({accessKey:z.string().max(128)}).parse(request.body);
        if(!timingSafeEqual(digest(accessKey),digest(env.PPT_ACCESS_KEY))){failures++;throw new PublicError(401,'PPT_ACCESS_REQUIRED','访问口令错误。');}
        const body=`${Date.now()+8*3600000}.${randomBytes(18).toString('base64url')}`;
        reply.header('set-cookie',`cp_ppt=${body}.${signature(body)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800${env.NODE_ENV==='production'?'; Secure':''}`);
        reply.header('cache-control','no-store');return {authenticated:true};
      });
      app.delete('/api/presentation-session',async(_request,reply)=>{reply.header('set-cookie',`cp_ppt=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${env.NODE_ENV==='production'?'; Secure':''}`);return {authenticated:false};});
    },
  };
}
export type PresentationAuth=ReturnType<typeof createPresentationAuth>;
