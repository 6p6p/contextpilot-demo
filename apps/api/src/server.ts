import 'dotenv/config';
import { parseEnv } from './config/env.js';
import { buildApp } from './app.js';
import {deploymentMissing} from './config/deployment.js';
import { startupDiagnostic, type StartupStage } from './config/startup-diagnostic.js';

let stage: StartupStage = 'environment';
let app: ReturnType<typeof buildApp> | undefined;
try {
  const env = parseEnv(process.env);
  stage = 'application';
  app = buildApp(env);
  if(env.NODE_ENV==='production'&&deploymentMissing(env).length)app.log.warn({fields:deploymentMissing(env)},'Demo integrations unconfigured; run deploy:check before cloud deployment');
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app?.close().catch(() => { process.exitCode = 1; }); });
  }
  stage = 'plugins';
  await app.ready();
  stage = 'listen';
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  console.error('Startup failed. Check environment fields and port availability; credentials are not logged.');
  console.error(JSON.stringify(startupDiagnostic(stage, error)));
  process.exitCode = 1;
  await app?.close().catch(() => {});
}
