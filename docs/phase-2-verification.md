# Phase 2 acceptance — 2026-11-03

## Actual external services

- Supabase PostgreSQL through Session pooler. Direct IPv6 was unreachable locally, so user supplied the pooler URI. Credentials stayed in ignored root .env.
- User downloaded Supabase CA from project dashboard and supplied DATABASE_CA_CERT. Local TLS socket confirms encrypted=true and authorized=true; rejectUnauthorized was never disabled.
- Actual pgvector distance operation succeeds. Migrations 0000/0001 applied successfully: extension initialization and additive conversations/messages tables, constraints, indexes, RLS. No drop/reset/truncate/delete.
- DeepSeek official endpoint, configured deepseek-flash model: real replies saved to PostgreSQL and loaded by browser. No model or database mocks in live E2E.

## Test results

| Command | Result / scope |
|---|---|
| npm run db:check | Exit 0; connected, client TLS/certificate verified, vector operation verified |
| npm run db:migrate | Exit 0; versioned migration applied |
| RUN_LIVE_TESTS=1 npm run test:integration | 2 tests pass against real Supabase; model explicitly stubbed, no provider calls |
| RUN_LIVE_TESTS=1 npm run test:e2e:live | 1 test passes in Chrome (18.7s), real DB and model: create, two turns recalling an opaque marker, reload, new conversation, switch back |
| npm run check | Strict types, 29 offline tests and both builds pass |
| Default development/production E2E | Real local Web/API without external DB/model, checked separately |

DB tests verify independent connections see committed messages, same request ID does not regenerate, changed content conflicts, concurrent turn is rejected, failed reply persists and stale pending reply becomes interrupted. Acceptance records remain in database; no user records were deleted.

## Defects found and fixed

1. TLS check originally interpreted pg_stat_ssl as client TLS. Through a pooler that view reports the server-side leg. Check now reports actual Node TLS socket authorization separately from server-reported SSL.
2. Initial marker assertion included a natural-language description which the model legitimately paraphrased. Test now uses an opaque CP identifier while retaining exact identifier checks.
3. A late list response could replace newly selected conversation state; stale list versions are discarded and existing selection is preserved.
4. Composer remained usable while creating a conversation. It is now disabled during creation, and send handler guards creating/loading. Live E2E waits for actual creation and verifies the selected ID before messaging.

## Budget and privacy

User approved up to ¥1. Five model calls total across manual acceptance/debug runs, no automatic retries. Each output limited to 1024 tokens; prompts were short synthetic acceptance text. Using the official deepseek-flash peak prices ($0.3/M uncached input, $1.2/M output) gives an estimated total far below ¥1. Exact account billing was not accessed. Source checked on acceptance date: https://api-docs.deepseek.com/quick_start/pricing/

No raw secrets, database URI or API keys were printed, committed or passed to browser. Actual .env, certs/, browser artifacts and node_modules are ignored. No new dependencies, public deployment, paid resources or remote push in this phase.

## Remaining limits

- pg_stat_ssl reports pooler-to-Postgres SSL off. The separately verified local TLS leg must not be represented as end-to-end TLS. Supabase SSL enforcement controls both legs and changing it reboots the database; the agent did not change the cloud setting. Project owner should review before public deployment: https://supabase.com/docs/guides/platform/ssl-enforcement
- Local shared demo workspace has no login yet. Do not expose business APIs publicly before protection is implemented and approved.
- History display is bounded to 100 conversations/200 messages; model context to 20 completed messages/24000 characters. All messages remain in PostgreSQL. This is not cross-session semantic memory.
- No automatic regeneration after interruption; pending replies expire to a visible failure on subsequent read after 90s. No provider retries or tool execution.
- PDF/RAG, extracted long-term memory, search, email and PPT remain outside Phase 2.
