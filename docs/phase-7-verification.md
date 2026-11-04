# Phase 7 verification — real acceptance completed

Baseline d85dde3. User authorized root config loading without credential output, additive migration0007, <=6 Tavily Basic calls and <=CNY3 combined external API budget. No new supplier/resource/deployment/email permission. Local completion commit follows final checks; identify with git log -1.

## Implementation / changed files

- shared/search.ts and shared/chat.ts: typed auto/required/off and web source snapshots.
- apps/api/src/search/service.ts: Tavily provider, intent heuristic, query privacy checks, fixed basic requests, attempted-call cap, timeout/response size/result bounds, sanitized errors and verified extractive answers.
- apps/api/src/chat/{service,routes}.ts, app.ts: persistent chat integration and dedup/mode conflict handling. Existing PDF/memory paths retained. Search failure persists failed assistant, not fake success.
- apps/api/src/config/env.ts and .env.example: backend-only search settings; HTTPS validation. Never changed/read-out root credential values.
- db/schema.ts, drizzle/0007_furry_bill_hollister.sql, generated metadata: search_mode default off and web_sources default[]; additive SQL only. Existing historical rows compatible; migration applied with npm run db:migrate. Read-only schema/default checks and vector operation pass.
- llm/adapter.ts: per-request structured output options; search uses JSON/non-thinking (only official DeepSeek host) and max4096, preserving ordinary chat/meeting configuration.
- ChatWorkspace.tsx: mode, combined pending state, error codes, actual clickable links, dates, “已引用/仅检索”, persistent history. All results retained, multiple quotes may reference one source ID.
- scripts/acceptance-telemetry.mjs, phase7-preflight.ts, e2e.mjs and playwright.search.config.ts: explicit opt-in search live entrypoint; default/other live suites clear Tavily key. Phase7 ledger caps6 search/20LLM/12embedding and CNY3 before request; sequential processes aggregate the same ledger. No parallel instrumented API processes. Host/model pricing checks, no bodies/headers/credentials logged. All test API processes disable email and clear Resend key without changing root config.
- tests/unit/{search,llm}.test.ts, tests/integration/search.test.ts, tests/e2e/workspace.spec.ts, tests/search-live/{search,regression}.spec.ts: evidence layers below. README/SPEC/TASKS updated.

## Real search / browser evidence

1. Safe config check reported booleans only: required variables present, official Tavily/DeepSeek endpoints and DeepSeek Flash model matched, BGE-M3 matched, EMAIL_DELIVERY_ENABLED=false. Ports3001/3101 not responding. No outstanding real PDF/meeting jobs before starting workers; isolated MEMORY_SCOPE=phase7-live-20261104.
2. node --import ./scripts/acceptance-telemetry.mjs --import tsx scripts/phase7-preflight.ts: actual Tavily HTTP200,5 usable sources. First Basic request, no LLM. Followed by migration0007 and DB compatibility audit.
3. Required/auto browser suite: required public question “Node.js latest LTS release official” triggered exactly1 search; auto “当前 TypeScript 最新稳定版本是什么？” triggered exactly1; ordinary binary-search question and off technology-news question each caused0 search calls. Duplicate clientRequestId caused0 additional search calls. All four final turns completed.
4. Actual Node.js source links returned HTTP200: https://nodejs.org/en/about/previous-releases , https://nodejs.org/en/blog/release/v26.13.0 , https://nodejs.org/en/blog/release/v24.11.0 . Node.js sources describe different release lines; answer keeps them separate. Example short verified quote: “2026-10-28, Version 26.13.0 'Lithium' (LTS), @richardlau”. This quote is source text, not an inferred publication timestamp.
5. Query time example 2026-11-04T09:17:00.092Z (=17:17:00.092 Asia/Shanghai). Releases-list provider published_date was Sat,24 Oct2026 08:00:00GMT; individual release source publication fields were null and not filled from article headings. TypeScript answer quoted the actual returned Wikipedia stable-version field,7.0.2; page truth/freshness is not guaranteed by exact quote matching.
6. Actual response quotes were verified as exact substrings of persisted actual snippets; content contains only verified selections. Public-source URL checks forwarded no credentials and did not call a paid extraction API. Three selected Node.js links checked; not a claim that every retrieved URL is always accessible.
7. Browser refresh and new API process restored identical citations without search. Final actual metadata call saved all5 unique search result IDs, selected quotations plus unselected records. Multiple quotes from one source produce several cards; final read-only browser audit verifies all cards, dates, labels and refresh. Another independent DB connection audits snapshots.

Non-secret synthetic test IDs/provider evidence and usage logs are retained in ignored .acceptance: phase7-preflight.json, phase7-search-result.json, phase7-final-search-result.json, phase7-regression-result.json, phase7-usage.jsonl and phase7-usage-summary.json. Screenshots in ignored test-results. No deletion/cleanup of user records.

## Test commands and results by layer

Offline: npm run check — strict TypeScript,103 unit/API/compatibility tests, both builds pass. Mocks cover temporal/general intent, modes, query blocking, limits, missing config, empty/malformed/oversized data,429/402/432/433/401/500,timeout,no retry,invalid quotes,injected model prose,source metadata and request-local model settings. These do not prove real account failure behavior or semantic immunity to every injection.

RealDB / explicitly stubbed external APIs: RUN_LIVE_TESTS=1 npm run test:integration —7 files/20 tests passed (310.69s). Then expanded npm run test:integration -- tests/integration/search.test.ts —2 passed (38.94s); first repeats prior case, second adds unavailable/timeout/empty/invalid/private-query persisted states. Across suites21 distinct tests. Includes existing chat,PDF/pgvector,meeting,memory,worker isolation,email transaction regressions. No real search/LLM/Storage/email provider calls in this layer.

Real APIs / browser (RUN_LIVE_TESTS=1 ACCEPTANCE_PHASE=7 ACCEPTANCE_TRACKING=1 PLAYWRIGHT_CHANNEL=chrome):
- node scripts/e2e.mjs --live --search-live -- --grep 'REAL required' — corrected implementation1 passed (44.0s), actual Tavily+LLM+DB+browser.
- same entrypoint --grep RESTART —1 passed after a new server process,0 added search.
- same entrypoint --grep 'REAL chat' — generated real chat, cross-conversation memory, two PDF uploads/embeddings/RAG and no-risk meeting; failed only on erroneous draft assumption described below. Earlier assertions passed; actual outputs retained.
- same entrypoint --grep 'FINAL|PERSISTED' —final targeted run3 passed (26.3s), including restarted real-provider history, regression evidence and all search metadata/cards;0 new external calls in this corrected read-only run.
- Final credential-free dev/prod E2E and checks recorded in final audit below.

## Failed attempts and corrections (retained)

- Initial grep '^REAL required' matched no tests;0 paid calls. Corrected test-name filter.
- First required flow: Tavily HTTP200, DeepSeek HTTP200 finish_reason=length at1024 output tokens, no valid text, persisted LLM_INVALID_RESPONSE and published no answer. Fixed only search's request-local JSON/non-thinking/output options; added ordinary-chat isolation test. No automatic retries. Failed flow counted in budget/search total.
- Regression test expected no-risk meeting draft.deliveryState; existing implementation creates drafts only for risks (meetings/service.ts). Actual ready meeting correctly had risks=[]/draft=null. Corrected test, audited already-generated records from DB and browser instead of repeating paid generation. No change to meeting/email behavior.
- Final metadata test expected5 cards; actual model chose multiple quotes for source IDs W3/W5, producing7 cards across5 unique results. Corrected assertion to count unique IDs and all saved cards; repeated read-only audit passed, no new paid request.

## Calls / cost

5/6 Tavily Basic real calls, all HTTP200: preflight1, first failed model flow1, successful required+auto2, complete-result metadata1. Basic each1credit:5credits (later3 responses explicitly reported1 each; first2 did not request usage, priced by documented basic contract). Search estimate USD0.040 before existing free credits; account invoice/balance not read.

DeepSeek18 HTTP200 calls,18223 input /5897 output tokens including the initial truncation and background synthetic-memory extraction. At official Flash peak uncached USD0.30/M input,USD1.20/M output, conservatively10RMB/USD: CNY0.125433. Six actual SiliconFlow BAAI/bge-m3 calls,535 tokens; configured official free model,1024dimensions. No supplier substitution.

Conservative tariff estimate CNY0.525433 (~0.53); cumulative worst-case reservations CNY1.390012 <3. All29 reserved requests have matching HTTP200 responses and usage reports where applicable; no missing/unresolved requests. Reservation is not actual billing. Telemetry kept the complete multi-process total, never reset ledger for reruns. No more external calls needed.

Pricing rechecked2026-11-04: https://docs.tavily.com/documentation/api-credits ; https://api-docs.deepseek.com/quick_start/pricing/ ; https://siliconflow.cn/pricing . No new paid resources or account upgrades.

## Known limits / boundaries

Auto uses imperfect keyword rules; privacy screening is conservative and cannot identify arbitrary private facts. Only current public short questions are sent to search; no retrieved private context. Process search cap resets on restart; production access/billing protection remains future work. Extractive answers may be less helpful than synthesis; exact provenance cannot establish truth or relevance. All retrieved metadata is preserved, but unselected snippets are explicitly not answer evidence. No full-page fetching or streamed provider stages. Mocked failures/injection tests are labeled, not false live-quota acceptance. No public deployment or multi-user/auth claim.

Phase3 intermittent upload HTTP500 remains OPEN. RAG synthesis evaluation remains OPEN. No real email sends, no Resend/root .env changes, no secrets printed/committed, no destructive DB operation, no provisioning/deployment/remote push/PPT. Stop after local completion commit.

## Final audit

Final npm run check: strict types,103 tests,both builds passed. npm run test:e2e and npm run test:e2e:production: Chrome1 passed each. git diff --check passed.

Final independent DB audit initially found one processing Phase7 meeting-memory job left by stopping the test server after meeting readiness. Its lease had expired with attempts1. Existing createMemoryService.processOne recovered it under the same Phase7 instrumentation/scope, with one additional free embedding call and no LLM/search. No lease edits or destructive SQL. This is expected bounded lease recovery, not a search retry. Final10/10 Phase7 memory jobs ready,0 failed/pending; all29 external requests have matching HTTP200 records. Root EMAIL_DELIVERY_ENABLED=false and independent search snapshot match verified again. The real regression limitation/failure history above is retained.

Final cumulative counts: Tavily5/6,DeepSeek18,Embedding6; estimate CNY0.525433 and conservative reservation CNY1.390012. No further calls required. No completion of PPT or next phase implied.
