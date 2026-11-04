import { z } from 'zod';

const optionalDatabaseUrl = z.preprocess(
  value => value === '' ? undefined : value,
  z.url().refine(value => /^postgres(?:ql)?:\/\//.test(value)).optional(),
);
const schema = z.object({
  DEMO_ACCESS_KEY: z.preprocess(v=>v===''?undefined:v,z.string().min(32).max(128).optional()),
  DEMO_API_PER_MINUTE:z.coerce.number().int().min(1).max(1000).default(300),
  DEMO_WRITES_PER_MINUTE:z.coerce.number().int().min(1).max(100).default(20),
  DEMO_UPLOADS_PER_HOUR:z.coerce.number().int().min(1).max(100).default(5),
  DEMO_MODEL_CALLS:z.coerce.number().int().min(1).max(1000).default(100),
  DEMO_EMBEDDING_CALLS:z.coerce.number().int().min(1).max(2000).default(200),
  DEMO_SEARCH_CALLS:z.coerce.number().int().min(1).max(100).default(20),
  PPT_ACCESS_KEY: z.preprocess(v => v === '' ? undefined : v, z.string().min(32).max(128).optional()),
  PPT_SCOPE: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).default('demo'),
  PPT_MAX_TOKENS: z.coerce.number().int().min(2048).max(8192).default(8192),
  TAVILY_API_KEY: z.preprocess(v => v === '' ? undefined : v, z.string().min(1).optional()),
  TAVILY_BASE_URL: z.url().default('https://api.tavily.com'),
  SEARCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(15000).default(10000),
  SEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(5).default(5),
  SEARCH_MAX_CALLS: z.coerce.number().int().min(1).max(100).default(20),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  EMAIL_DELIVERY_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  EMAIL_SCOPE: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).default('demo'),
  RESEND_API_KEY: z.preprocess(v => v === '' ? undefined : v, z.string().min(1).optional()),
  EMAIL_FROM: z.preprocess(v => v === '' ? undefined : v, z.email().optional()),
  EMAIL_ALLOWED_RECIPIENTS: z.string().default('').transform(v => v.split(',').map(s => s.trim()).filter(Boolean)).pipe(z.array(z.email()).max(10)),
  EMAIL_MODE: z.enum(['test', 'verified']).default('test'),
  EMAIL_TEST_ACCOUNT_ADDRESS: z.preprocess(v => v === '' ? undefined : v, z.email().optional()),
  RESEND_DOMAIN_ID: z.preprocess(v => v === '' ? undefined : v, z.uuid().optional()),
  MEMORY_SCOPE: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).default('demo'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: optionalDatabaseUrl,
  DATABASE_SSL: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
  DATABASE_CA_CERT: z.string().optional(),
  LLM_BASE_URL: z.preprocess(v => v === '' ? undefined : v, z.url().optional()),
  LLM_MODEL: z.preprocess(v => v === '' ? undefined : v, z.string().min(1).optional()),
  LLM_API_KEY: z.preprocess(v => v === '' ? undefined : v, z.string().min(1).optional()),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(45000),
  LLM_MAX_TOKENS: z.coerce.number().int().min(16).max(4096).default(1024),
  MEETING_MAX_TOKENS: z.coerce.number().int().min(1024).max(8192).default(8192),
  MEETING_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(90000),
  SUPABASE_URL: z.preprocess(v => v === '' ? undefined : v, z.url().optional()),
  SUPABASE_STORAGE_KEY: z.preprocess(v => v === '' ? undefined : v, z.string().min(1).optional()),
  SUPABASE_STORAGE_BUCKET: z.preprocess(v => v === '' ? undefined : v, z.string().regex(/^[a-zA-Z0-9_-]+$/).optional()),
  EMBEDDING_BASE_URL: z.preprocess(v => v === '' ? undefined : v, z.url().optional()),
  EMBEDDING_API_KEY: z.preprocess(v => v === '' ? undefined : v, z.string().min(1).optional()),
  EMBEDDING_MODEL: z.preprocess(v => v === '' ? undefined : v, z.string().min(1).optional()),
  EMBEDDING_DIMENSIONS: z.preprocess(v => v === '' ? undefined : v, z.coerce.number().int().min(1).max(4096).optional()),
  RAG_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.5),
});

export function parseEnv(source: NodeJS.ProcessEnv) {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Report field names only: validation errors must never echo credentials.
    throw new Error(`Invalid environment fields: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  if(result.data.NODE_ENV==='production'){
    if(!result.data.DEMO_ACCESS_KEY)throw new Error('Production requires DEMO_ACCESS_KEY');
    if(result.data.EMAIL_DELIVERY_ENABLED)throw new Error('Demo production requires EMAIL_DELIVERY_ENABLED=false');
    if(!source.HOST)result.data.HOST='0.0.0.0';
  }
  if(!['127.0.0.1','localhost','::1'].includes(result.data.HOST)&&!result.data.DEMO_ACCESS_KEY)throw new Error('Non-loopback HOST requires DEMO_ACCESS_KEY');
  if (result.data.DATABASE_URL) {
    const url = new URL(result.data.DATABASE_URL);
    if (url.search || url.hash) throw new Error('DATABASE_URL must not contain query parameters or fragments; encode password and configure TLS separately');
    if (!result.data.DATABASE_SSL && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Remote DATABASE_URL requires DATABASE_SSL=true');
  }
  if (result.data.LLM_BASE_URL) {
    const url = new URL(result.data.LLM_BASE_URL);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error('Invalid LLM_BASE_URL: use HTTPS without credentials or query parameters');
  }
  for (const field of ['SUPABASE_URL', 'EMBEDDING_BASE_URL', 'TAVILY_BASE_URL'] as const) {
    const value = result.data[field];
    if (!value) continue;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error(`Invalid ${field}: HTTPS without credentials or query required`);
  }
  return result.data;
}
export type Env = ReturnType<typeof parseEnv>;
