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
  DATABASE_SSL: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
});

export function parseEnv(source: NodeJS.ProcessEnv) {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Report field names only: validation errors must never echo credentials.
    throw new Error(`Invalid environment fields: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  return result.data;
}
export type Env = ReturnType<typeof parseEnv>;
