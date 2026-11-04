import type { Env } from '../config/env.js';
import { PublicError } from '../errors.js';

export interface PrivateStorage {
  origin: string; bucket: string;
  put(key: string, bytes: Buffer, contentType?: 'application/pdf' | 'text/plain' | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'): Promise<void>;
  get(key: string): Promise<Buffer>;
  find?(key: string): Promise<Buffer | null>;
}
export function createStorage(env: Env, transport: typeof fetch = fetch): PrivateStorage | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_STORAGE_KEY || !env.SUPABASE_STORAGE_BUCKET) return null;
  const origin = env.SUPABASE_URL.replace(/\/+$/, '');
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const headers = { apikey: env.SUPABASE_STORAGE_KEY, authorization: `Bearer ${env.SUPABASE_STORAGE_KEY}` };
  async function call(path: string, options?: RequestInit) {
    try {
      const response = await transport(`${origin}/storage/v1${path}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { ...headers, ...options?.headers } });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Storage request failed'); }
      return response;
    } catch { throw new PublicError(502, 'STORAGE_UNAVAILABLE', '私有存储不可用，请检查后端配置和权限。'); }
  }
  async function requirePrivate() {
    const info = await (await call(`/bucket/${encodeURIComponent(bucket)}`)).json() as { public?: unknown };
    if (info.public !== false) throw new PublicError(503, 'STORAGE_BUCKET_NOT_PRIVATE', '知识库只允许使用已存在的私有 Bucket。');
  }
  const objectPath = (key: string) => `${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  async function find(key: string) {
    await requirePrivate();
    try {
      const response=await transport(`${origin}/storage/v1/object/authenticated/${objectPath(key)}`,{redirect:'error',signal:AbortSignal.timeout(30000),headers});
      if(response.status===404){await response.body?.cancel();return null;}
      if(response.status===400){
        const error=await response.json() as {statusCode?:string|number;error?:string;code?:string};
        if(Number(error.statusCode)===404&&(error.error==='not_found'||error.code==='NoSuchKey'))return null;
        throw new Error('Storage400 is not an absent object');
      }
      if(!response.ok){await response.body?.cancel();throw new Error('Object lookup failed');}
      return Buffer.from(await response.arrayBuffer());
    }catch{throw new PublicError(502,'STORAGE_UNAVAILABLE','私有存储核查失败。');}
  }
  return { origin, bucket, find,
    async put(key, bytes, contentType = 'application/pdf') { await requirePrivate(); const response = await call(`/object/${objectPath(key)}`, { method: 'POST', headers: { 'content-type': contentType, 'x-upsert': 'false' }, body: new Uint8Array(bytes) }); await response.body?.cancel(); },
    async get(key) { await requirePrivate(); const response = await call(`/object/authenticated/${objectPath(key)}`); return Buffer.from(await response.arrayBuffer()); },
  };
}
