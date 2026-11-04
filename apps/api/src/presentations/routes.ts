import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { startDocumentWorker } from '../knowledge/service.js';
import type { PresentationService } from './service.js';
import type { PresentationAuth } from './auth.js';
import { PublicError } from '../errors.js';
import { PPTX_MIME } from './render.js';
export function registerPresentationRoutes(app:FastifyInstance,service:PresentationService|null,auth:PresentationAuth,enabled:boolean) {
  auth.register(app);
  const requireService=()=>{if(!service)throw new PublicError(503,'DATABASE_NOT_CONFIGURED','数据库未配置。');return service;};
  const id=(params:unknown)=>z.object({id:z.uuid()}).parse(params).id;
  app.get('/api/presentations',async(request,reply)=>{auth.require(request);reply.header('cache-control','no-store');return {presentations:await requireService().list()};});
  app.get('/api/presentations/:id',async(request,reply)=>{auth.require(request);reply.header('cache-control','no-store');return requireService().detail(id(request.params));});
  app.post('/api/presentations/:id/retry',async request=>{auth.require(request);const input=z.object({replan:z.boolean().default(false)}).strict().parse(request.body??{});return {presentation:await requireService().retry(id(request.params),input.replan)};});
  app.get('/api/presentations/:id/download',async(request,reply)=>{auth.require(request);const file=await requireService().download(id(request.params));reply.header('cache-control','no-store').header('x-content-type-options','nosniff').header('content-disposition',`attachment; filename="${file.filename}"`).type(PPTX_MIME);return reply.send(file.bytes);});
  if(service&&enabled){let stop:(()=>Promise<void>)|undefined;app.addHook('onReady',async()=>{stop=startDocumentWorker(service);});app.addHook('preClose',async()=>{await stop?.();});}
}
