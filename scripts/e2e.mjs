import {relayRedacted} from "./redact-output.mjs";
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';

const production = process.argv[2] === 'production';
const emailStub = process.argv.includes('--email-stub');
if (emailStub) {
  if (process.env.RUN_LIVE_TESTS !== '1') throw new Error('Email stub browser test requires authorized real DB and RUN_LIVE_TESTS=1');
  dotenv.config({ quiet: true });
  if (!process.env.DATABASE_URL) throw new Error('Database required for email stub browser test');
}
const live = process.argv.includes('--live');
const presentationLive=process.argv.includes('--presentation-live');
if(presentationLive&&(!live||process.env.ACCEPTANCE_PHASE!=='8'||process.env.ACCEPTANCE_TRACKING!=='1'))throw new Error('PPT live requires Phase8 tracking and authorization');
const searchLive = process.argv.includes('--search-live');
if (searchLive && (!live || process.env.ACCEPTANCE_PHASE !== '7' || process.env.ACCEPTANCE_TRACKING !== '1')) throw new Error('Search live requires Phase7 tracking and live authorization');
const ragLive = process.argv.includes('--rag-live');
const memoryLive = process.argv.includes('--memory-live');
const meetingsLive = process.argv.includes('--meetings-live');
const apiPort = 3101;
const webPort = 5273;
if (live) {
  if (process.env.RUN_LIVE_TESTS !== '1') throw new Error('Live E2E requires RUN_LIVE_TESTS=1; real API calls may incur cost.');
  dotenv.config({ quiet: true });
  if (!process.env.DATABASE_URL || !process.env.LLM_BASE_URL || !process.env.LLM_MODEL || !process.env.LLM_API_KEY) throw new Error('Live E2E requires database and LLM configuration in root .env.');
  if (ragLive && !['SUPABASE_URL', 'SUPABASE_STORAGE_KEY', 'SUPABASE_STORAGE_BUCKET', 'EMBEDDING_BASE_URL', 'EMBEDDING_API_KEY', 'EMBEDDING_MODEL', 'EMBEDDING_DIMENSIONS'].every(key => process.env[key])) throw new Error('Real RAG E2E requires complete private Storage and Embedding configuration.');
  if (meetingsLive && !['SUPABASE_URL', 'SUPABASE_STORAGE_KEY', 'SUPABASE_STORAGE_BUCKET'].every(key => process.env[key])) throw new Error('Meeting E2E requires private Storage configuration.');
}
const children = [];
const env = {
  ...process.env,
  DEMO_ACCESS_KEY: production ? 'synthetic-production-e2e-access-1234567890' : '',
  PPT_ACCESS_KEY: presentationLive ? process.env.PPT_ACCESS_KEY : '',
  DOTENV_CONFIG_PATH: live || emailStub ? (process.env.DOTENV_CONFIG_PATH || '.env') : '.acceptance/disabled-offline.env',
  ...(presentationLive ? {PPT_SCOPE:process.env.PPT_ACCEPTANCE_SCOPE||'phase8-acceptance',MEMORY_SCOPE:'phase8-acceptance'} : {}),
  TAVILY_API_KEY: searchLive || presentationLive ? process.env.TAVILY_API_KEY : '',
  ...(searchLive ? { SEARCH_MAX_CALLS: '5', MEMORY_SCOPE: 'phase7-live-20261104' } : {}),
  EMAIL_DELIVERY_ENABLED: 'false', RESEND_API_KEY: '',
  NODE_ENV: production ? 'production' : 'test',
  PORT: String(apiPort), HOST: '127.0.0.1', DATABASE_URL: live || emailStub ? process.env.DATABASE_URL : '', LOG_LEVEL: 'silent',
  ...(!live ? { LLM_BASE_URL: '', LLM_MODEL: '', LLM_API_KEY: '', SUPABASE_STORAGE_KEY: '', EMBEDDING_API_KEY: '' } : {}),
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
  const child = spawn(process.execPath, args, { env, stdio: ['ignore','pipe','pipe'], windowsHide: true });
  // Playwright request errors can contain cookie headers. Redact before any output reaches logs.
  const secrets=['DEMO_ACCESS_KEY','PPT_ACCESS_KEY','LLM_API_KEY','EMBEDDING_API_KEY','SUPABASE_STORAGE_KEY','RESEND_API_KEY','TAVILY_API_KEY','DATABASE_URL'].map(k=>env[k]).filter(Boolean);
  relayRedacted(child.stdout,process.stdout,secrets);relayRedacted(child.stderr,process.stderr,secrets);
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
  if (live) {
    let existing = false;
    try { const response = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(2000) }); const body = await response.json(); existing = body.service === 'contextpilot-api'; } catch { /* No default development server responding. */ }
    if (existing) throw new Error('Stop the development API on port 3001 before live acceptance; workers share durable queues.');
  }
  await assertPortFree(apiPort);
  if (!production) await assertPortFree(webPort);
  const instrumentation = live && process.env.ACCEPTANCE_TRACKING === '1' ? ['--import', './scripts/acceptance-telemetry.mjs'] : [];
  const api = start([...instrumentation, ...(production
    ? ['dist/server/apps/api/src/server.js']
    : ['--import', 'tsx', emailStub ? 'tests/support/email-server.ts' : 'apps/api/src/server.ts'])]);
  await waitFor(`http://127.0.0.1:${apiPort}/api/health`, api);
  if (live) await waitFor(`http://127.0.0.1:${apiPort}/api/ready`, api);
  if (!production) {
    const web = start(['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts', '--port', String(webPort)]);
    await waitFor(`http://127.0.0.1:${webPort}`, web);
  }
  const separator = process.argv.indexOf('--');
  const testArguments = separator >= 0 ? process.argv.slice(separator + 1) : [];
  const runner = start(['node_modules/@playwright/test/cli.js', 'test', '--config', presentationLive ? 'playwright.presentation.config.ts' : searchLive ? 'playwright.search.config.ts' : emailStub ? 'playwright.email-stub.config.ts' : memoryLive ? 'playwright.memory.config.ts' : meetingsLive ? 'playwright.meetings.config.ts' : ragLive ? 'playwright.rag.config.ts' : live ? 'playwright.live.config.ts' : production ? 'playwright.production.config.ts' : 'playwright.config.ts', ...testArguments]);
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
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    try { await stopped; } finally { clearTimeout(timer); }
  }));
}
