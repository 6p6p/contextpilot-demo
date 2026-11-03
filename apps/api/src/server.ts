import 'dotenv/config';
import { parseEnv } from './config/env.js';
import { buildApp } from './app.js';

try {
  const env = parseEnv(process.env);
  const app = buildApp(env);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
  }
  await app.listen({ host: env.HOST, port: env.PORT });
} catch {
  console.error('Startup failed. Check environment fields and port availability; credentials are not logged.');
  process.exitCode = 1;
}
