# Phase 3 verification — passed, 2026-11-03

Phase 3 passed real service acceptance. Supabase private Storage, actual SiliconFlow BAAI/bge-m3 / 1024 dimensions, PostgreSQL/pgvector and DeepSeek were used without provider mocks in live suites. Earlier 402 was reported and calls stopped; after user account check, exactly one minimal Chinese preflight returned HTTP 200 and valid 1024-dimensional vector (11 tokens, no retry).

## Completed real acceptance

- Real RAG browser test passed in 47.6s: original PDF upload/download SHA-256, page extraction/chunks/embedding, multi-document answer (AMBER-593 on project PDF page 2; Mira Qiao on owner PDF page 1), persisted citations and reload, unsupported insurance-contract question returns 证据不足.
- Real blank/damaged PDF test passed in 18.2s: PDF_NO_TEXT / PDF_PARSE_FAILED persist and publish zero chunks.
- Real normal-chat E2E passed in 22.3s: two turns remember an opaque marker, reload and conversation switching remain correct.
- Independent process audit: 8 real chunks across 4 successfully processed real test uploads; configured dimensions and vector_dims both 1024. Six original Storage objects (including invalid PDFs) re-downloaded with matching SHA-256. Two persisted citation snapshots verified against actual chunk text/file/page.
- Supplemental real-DB, stub-external shutdown/lease-resume regression passed in 8.94s (targeted test, other 5 integration cases skipped). Existing 5 DB integration cases had already passed separately. Final offline check: 45 tests, strict types, both builds. Default development/production E2E each passed.

### Temporary-data cleanup

Explicitly authorized current-run cleanup completed: 6 cloud objects, 7 document rows (6 real uploads + 1 supplemental stub case), 10 chunks, 8 messages and 3 test conversations. All captured baseline document/conversation IDs remain. Only exact recorded IDs/object keys were eligible; no filename/time-range/bucket-prefix bulk deletion. Earlier user data and pre-existing test records were retained. Reusable fixture PDFs remain versioned; ignored `.acceptance/` retains non-secret ID/usage/cleanup reports.

### Observed defects fixed during acceptance

Chrome response-body cache eviction interrupted the first browser run; live tests now use unique filenames and rendered file/current-session IDs instead of inspector response bodies. A later isolated upload 500 did not reproduce in direct API diagnosis; live harness now waits for actual DB readiness before opening browser.

A proven lifecycle defect was fixed: waiting for a long in-flight embedding during close could exceed Fastify's default lifecycle timeout. Shutdown now cancels provider fetches before worker completion/pool close, preserves interrupted leases, uses a 30s Fastify lifecycle allowance and a 15s test-process grace period. Cancellation and recovery were independently regression-tested. No retry loop or new workflow platform added.

### Budget and observed usage

User authorized at most ¥5 for combined Embedding/LLM. Successful minimal preflight used 11 embedding tokens. Opt-in telemetry recorded 4 additional successful embedding responses / 304 input tokens; interrupted/background indexing may not be fully represented in that log, so this is not claimed as the exact all-process token total. SiliconFlow official pricing marks BAAI/bge-m3 free (not Pro): https://siliconflow.cn/pricing

All 4 measured DeepSeek calls returned HTTP 200, totaling 2188 prompt / 367 completion tokens. At the higher official deepseek-flash uncached input/output rates ($0.3/$1.2 per million), estimated LLM cost is US$0.0010968; combined model estimate is below ¥0.02, far below ¥5. Exact account deduction was not queried. Source: https://api-docs.deepseek.com/quick_start/pricing/

No automatic provider retries, recharge, model change, public deployment, remote push or new paid resource. No raw keys, Authorization headers, Storage secrets or DB credentials were printed or committed.

## Earlier blocked preflight (resolved; historical record)

1. Actual configured Supabase bucket metadata returned public=false. Uploaded the synthetic PDF under a random, run-specific acceptance/UUID/probe.pdf key. Downloaded bytes matched the local fixture SHA-256. Deleted exactly that probe key using the Storage API; cleanup returned success. No bucket creation or user-object deletion.
2. Confirmed backend configuration specifies BAAI/bge-m3 and 1024 dimensions, then made exactly one actual /embeddings request with a short synthetic input. Response HTTP 402; adapter reported EMBEDDING_UPSTREAM_ERROR. No vector or successful token-usage result was returned. No retry, fallback model or LLM call.
3. Actual embedding output dimension cannot be compared with pgvector without a successful response. Existing database/stub tests below remain valid but are not real-model evidence.
4. No database rows were created by this preflight and no previous user/test records were deleted. Only this run's known Storage probe was cleaned. Ignored test-results/storage-preflight.json retains non-secret probe/cleanup metadata.
5. Fees: one rejected Embedding request, zero LLM calls; no successful embedding token usage reported. Exact charge cannot be verified without provider billing. Storage transferred one small fixture in/out, with one temporary object removed; no new paid resource was provisioned. Do not claim a proven zero charge.

The specific historical 402 account cause was not independently confirmed. User then checked account/key/model settings; the next explicitly authorized single-request preflight succeeded. No raw response, API key, Storage secret or DB URI was logged. Compatible request shape: https://api-docs.siliconflow.cn/docs/api/embeddings-post

## Executed checks

| Command/check | Actual outcome | Evidence boundary |
|---|---|---|
| npm run check | Exit 0; 45 tests / 6 files, strict types, server compile and Vite build | Real local code; provider transports explicitly mocked where labeled |
| npm run db:generate | Generated 0002_blue_invisible_woman.sql | Offline Drizzle generation |
| Migration review | New documents/document_chunks with RLS/checks/indexes; messages adds default false/empty knowledgeMode/sources | No DROP, data deletion, existing field removal or credential changes |
| npm run db:migrate | Exit 0, Database migrations applied | Actual configured Supabase PostgreSQL |
| RUN_LIVE_TESTS=1 npm run test:integration | 5 tests / 2 files pass (45.16s) | Real DB/pgvector/PDF.js; Storage/Embedding/LLM are labeled stubs |
| npm run test:e2e with Chrome | 1 test passes | Actual local Web/API; external credentials isolated |
| npm run test:e2e:production with Chrome | 1 test passes | Built frontend and actual local Fastify; external credentials isolated |
| Fixture generation/rendering | 3 PDFs, 5 physical pages rendered and visually inspected | Actual ReportLab generation, PDF.js/canvas rendering; no private data |

## Covered behavior

- PDF.js extracts ORCHID-7421 / AMBER-593 from physical page 2 of rag-project.pdf. Chunk offset/overlap tests preserve exact normalized page substrings.
- MIME/header/extension/size rejection, blank PDF and corrupted input failure.
- Adapter tests reject wrong embedding dimensions/count/index, zero vectors and upstream failures. These do not prove a live embedding provider works.
- Real SQL cosine retrieval returns multiple synthetic documents in an isolated synthetic embedding space; independent DB connection reads ready state and page metadata.
- Real DB failure states persist with no published chunks; expired processing lease resumes from durable state.
- Citation gate rejects unknown IDs and non-literal quotes; filename/page cannot be supplied by model. Only verified quote content appears in final answer; no evidence avoids LLM call and returns insufficiency.
- Private Storage adapter refuses a mocked public-bucket response before object upload. Actual private bucket upload/download/hash preflight has now passed as recorded above.
- Existing ordinary chat service tests remain green; real model/UI chat and RAG E2E subsequently passed as recorded above.

## Remaining limits

1. Workspace login is not implemented; keep business APIs local until protection is approved and built.
2. The earlier pooler-to-Postgres SSL observation remains a separate cloud setting to review before public deployment; local client TLS/CA verification stays enabled.
3. Threshold 0.5 passes these synthetic fixtures with BAAI/bge-m3; larger real corpora need relevance evaluation. Plain exact cosine scan is intentionally used for this small Demo.
4. PDF mode takes a standalone question and returns verified extractive evidence, not arbitrary abstractive conclusions or conversational query rewriting. Provenance checks cannot establish that user PDFs are factually true.
5. OCR, meetings, extracted memory, web search, email and PPT are not implemented in Phase 3.

The project remains local-only without workspace login. No public deployment, remote Git push, new paid resource, OCR or meeting functionality.
