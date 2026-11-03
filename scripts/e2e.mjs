import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';

const production = process.argv[2] === 'production';
const live = process.argv.includes('--live');
const apiPort = 3101;
const webPort = 5273;
if (live) {
  if (process.env.RUN_LIVE_TESTS !== '1') throw new Error('Live E2E requires RUN_LIVE_TESTS=1; real API calls may incur cost.');
  dotenv.config({ quiet: true });
  if (!process.env.DATABASE_URL || !process.env.LLM_BASE_URL || !process.env.LLM_MODEL || !process.env.LLM_API_KEY) throw new Error('Live E2E requires database and LLM configuration in root .env.');
}
const children = [];
const env = {
  ...process.env,
  NODE_ENV: production ? 'production' : 'test',
  PORT: String(apiPort), HOST: '127.0.0.1', DATABASE_URL: live ? process.env.DATABASE_URL : '', LOG_LEVEL: 'silent',
  ...(!live ? { LLM_BASE_URL: '', LLM_MODEL: '', LLM_API_KEY: '' } : {}),
  API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
};

async function assertPortFree(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', () => reject(new Error(`Port ${port} is occupied; stop existing servers before E2E.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
function start(args) {
  // No shell/npm/watch wrappers: each service is one directly owned Node process.
  const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  return child;
}
async function waitFor(url, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Service exited before ready: ${url}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch { /* Service may still be starting. */ }
    await delay(100);
  }
  throw new Error(`Service startup timed out: ${url}`);
}
try {
  await assertPortFree(apiPort);
  if (!production) await assertPortFree(webPort);
  const api = start(production
    ? ['dist/server/apps/api/src/server.js']
    : ['--import', 'tsx', 'apps/api/src/server.ts']);
  await waitFor(`http://127.0.0.1:${apiPort}/api/health`, api);
  if (!production) {
    const web = start(['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts', '--port', String(webPort)]);
    await waitFor(`http://127.0.0.1:${webPort}`, web);
  }
  const runner = start(['node_modules/@playwright/test/cli.js', 'test', '--config', live ? 'playwright.live.config.ts' : production ? 'playwright.production.config.ts' : 'playwright.config.ts']);
  const [code] = await once(runner, 'exit');
  process.exitCode = code ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'E2E startup failed');
  process.exitCode = 1;
} finally {
  await Promise.all(children.map(async child => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const stopped = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await stopped; } finally { clearTimeout(timer); }
  }));
}
