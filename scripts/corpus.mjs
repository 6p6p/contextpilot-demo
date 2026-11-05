// Existing Vitest runner + a small per-case evidence summary; no service/env loading.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const id = process.argv[2];
if (id && !/^T0[1-8]$/.test(id)) throw new Error('Usage: npm run test:corpus -- [T01..T08]');
mkdirSync('test-results/corpus-v1', { recursive: true });
const output = `test-results/corpus-v1/vitest${id ? '-' + id : ''}.json`;
const args = ['node_modules/vitest/vitest.mjs', 'run', 'tests/unit/corpus-v1.test.ts', '--reporter=default', '--reporter=json', `--outputFile.json=${output}`];
if (id) args.push('-t', id);
const child = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, RUN_LIVE_TESTS: '0' } });
if (child.error) throw child.error;
const raw = JSON.parse(readFileSync(output, 'utf8'));
const assertions = raw.testResults.flatMap(t => t.assertionResults);
const results = Array.from({ length: 8 }, (_, i) => {
  const caseId = `T0${i + 1}`;
  const selected = assertions.filter(a => a.fullName.includes(caseId) && a.status !== 'pending' && a.status !== 'skipped');
  return { caseId, version: 'v1', layer: 'Unit / component Integration (STUB)', result: !selected.length ? 'NOT_RUN' : selected.every(a => a.status === 'passed') ? 'PASS' : 'FAIL', assertions: selected.length,
    failures: selected.filter(a => a.status !== 'passed').map(a => ({ assertion: a.fullName, reason: a.failureMessages.join('\n') })),
    database: 'NOT_RUN: full-workspace scope isolation not established', e2eBusiness: 'NOT_RUN', live: 'WAITING_AUTHORIZATION', externalCalls: 0 };
});
writeFileSync(`test-results/corpus-v1/results${id ? '-' + id : ''}.json`, JSON.stringify({ executedAt: new Date().toISOString(), overall: raw.success ? 'PASS' : 'FAIL', results }, null, 2) + '\n');
process.exitCode = child.status ?? 1;
