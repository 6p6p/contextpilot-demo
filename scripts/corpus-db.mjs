import { spawn } from 'node:child_process';
import { relayRedacted } from './redact-output.mjs';
import dotenv from 'dotenv';
// Explicit operator opt-in; default check/test never launches real DB tests.
if (process.env.CORPUS_SHARED_DB_AUTHORIZED !== '1') throw new Error('Set CORPUS_SHARED_DB_AUTHORIZED=1 only with shared Supabase test authorization.');
dotenv.config({ quiet: true });
const secrets = process.env.DATABASE_URL ? [process.env.DATABASE_URL] : [];
if (process.env.DATABASE_URL) {
  try { secrets.push(new URL(process.env.DATABASE_URL).password, decodeURIComponent(new URL(process.env.DATABASE_URL).password)); } catch { /* Configuration errors are sanitized by the test preflight. */ }
}
const id = process.argv[2];
if (id && !/^T0[1-8]$/.test(id)) throw new Error('Usage: npm run test:corpus:db -- [T01..T08]');
const args = ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts', 'tests/integration/corpus.test.ts'];
if (id) args.push('-t', id);
const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, RUN_LIVE_TESTS: '1' } });
relayRedacted(child.stdout, process.stdout, secrets); relayRedacted(child.stderr, process.stderr, secrets);
child.on('error', () => { process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
