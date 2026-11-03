import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const production = process.argv[2] === 'production';
const children = [];
const env = {
  ...process.env,
  NODE_ENV: production ? 'production' : 'test',
  PORT: '3001', HOST: '127.0.0.1', DATABASE_URL: '', LOG_LEVEL: 'silent',
  API_PROXY_TARGET: 'http://127.0.0.1:3001',
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
  await assertPortFree(3001);
  if (!production) await assertPortFree(5173);
  const api = start(production
    ? ['dist/server/apps/api/src/server.js']
    : ['--import', 'tsx', 'apps/api/src/server.ts']);
  await waitFor('http://127.0.0.1:3001/api/health', api);
  if (!production) {
    const web = start(['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts']);
    await waitFor('http://127.0.0.1:5173', web);
  }
  const runner = start(['node_modules/@playwright/test/cli.js', 'test', '--config', production ? 'playwright.production.config.ts' : 'playwright.config.ts']);
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
