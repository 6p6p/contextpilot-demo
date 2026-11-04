import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from '../apps/api/src/config/env.js';
import { createSearchProvider } from '../apps/api/src/search/service.js';
const env = parseEnv(process.env);
if (process.env.ACCEPTANCE_PHASE !== '7' || env.EMAIL_DELIVERY_ENABLED || env.TAVILY_BASE_URL !== 'https://api.tavily.com') throw new Error('Acceptance safety preflight failed');
const provider = createSearchProvider(env);
if (!provider) throw new Error('Tavily unconfigured');
try {
  const results = await provider.search('Node.js latest LTS release official');
  if (!results.length) throw new Error('No usable search results');
  mkdirSync('.acceptance', { recursive: true });
  writeFileSync('.acceptance/phase7-preflight.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ preflight: 'PASS', actualSearchCalls: 1, results: results.map(r => ({ title: r.title, url: r.url, queriedAt: r.queriedAt, publishedAt: r.publishedAt })) }));
} catch { console.error('Tavily preflight failed; stopped without retry. Consult sanitized usage ledger.'); process.exitCode = 1; }
