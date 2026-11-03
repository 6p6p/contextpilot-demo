import { z } from 'zod';

const optionalDatabaseUrl = z.preprocess(
  value => value === '' ? undefined : value,
  z.url().refine(value => /^postgres(?:ql)?:\/\//.test(value)).optional(),
);
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
});

export function parseEnv(source: NodeJS.ProcessEnv) {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Report field names only: validation errors must never echo credentials.
    throw new Error(`Invalid environment fields: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  if (result.data.DATABASE_URL) {
    const url = new URL(result.data.DATABASE_URL);
    if (url.search || url.hash) throw new Error('DATABASE_URL must not contain query parameters or fragments; encode password and configure TLS separately');
    if (!result.data.DATABASE_SSL && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Remote DATABASE_URL requires DATABASE_SSL=true');
  }
  if (result.data.LLM_BASE_URL) {
    const url = new URL(result.data.LLM_BASE_URL);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error('Invalid LLM_BASE_URL: use HTTPS without credentials or query parameters');
  }
  return result.data;
}
export type Env = ReturnType<typeof parseEnv>;
