// Test process ONLY: REAL PostgreSQL, explicitly STUB email provider; no external calls.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../apps/api/src/app.js';
import { parseEnv } from '../../apps/api/src/config/env.js';
import { createDatabase } from '../../apps/api/src/db/client.js';
import { meetings, meetingAnalyses, emailDrafts } from '../../apps/api/src/db/schema.js';
if (process.env.RUN_LIVE_TESTS !== '1') throw new Error('Authorized real DB required');
const env = parseEnv({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent', LLM_API_KEY: '', EMBEDDING_API_KEY: '', SUPABASE_STORAGE_KEY: '', RESEND_API_KEY: '', EMAIL_DELIVERY_ENABLED: 'true', EMAIL_SCOPE: `stub-ui-${randomUUID()}`, EMAIL_FROM: 'stub@example.invalid', EMAIL_MODE: 'verified', EMAIL_ALLOWED_RECIPIENTS: 'owner@example.invalid' });
const database = createDatabase(env)!;
try {
  for (const kind of ['reject','timeout','accepted','notallowed']) {
    const id = randomUUID();
    await database.db.insert(meetings).values({ id, filename: `phase6-email-ui-${kind}-${env.EMAIL_SCOPE}.txt`, sha256: randomUUID(), size: 1, objectKey: id, storageOrigin: 'https://stub.invalid', storageBucket: 'stub', transcript: 'STUB email UI fixture', lineCount: 1, status: 'ready' });
    const [analysis] = await database.db.insert(meetingAnalyses).values({ meetingId: id, version: 1, model: 'STUB', result: { topic: null, location: null, meetingDate: null, participants: [], topics: [], decisions: [], risks: [], actions: [] } }).returning();
    await database.db.update(meetings).set({ currentAnalysisId: analysis.id }).where(eq(meetings.id, id));
    await database.db.insert(emailDrafts).values({ meetingId: id, analysisId: analysis.id, riskIds: [], todoIds: [], recipients: ['owner@example.invalid'], subject: `STUB-${kind}`, body: 'Synthetic email preview. No real delivery.' });
  }
} finally { await database.pool.end(); }
const calls: Record<string, number> = {};
const app = buildApp(env, { emailProvider: { async verifySender() {}, async send(payload, key) {
  calls[key] = (calls[key] ?? 0) + 1;
  if (payload.subject.includes('timeout')) throw new Error('STUB ambiguous network timeout');
  if (payload.subject.includes('reject')) return { status: 'failed', errorCode: 'STUB_PROVIDER_REJECTED', requestId: 'stub-trace' };
  return { status: 'accepted', messageId: `stub-${randomUUID()}`, requestId: 'stub-trace' };
}, async inspect() { return { event: 'delivered' }; } } });
app.get('/api/test/email-calls', async () => calls);
await app.listen({ host: env.HOST, port: env.PORT });
console.log('STUB email browser fixture ready; real PostgreSQL, zero real provider calls.');
for (const signal of ['SIGTERM','SIGINT'] as const) process.once(signal, () => { void app.close(); });
