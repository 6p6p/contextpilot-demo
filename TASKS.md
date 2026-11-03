# Development tasks

Phases 1–4 are authorized. Phase 3 accepted at 8edb365; Phase 4 business acceptance is verified; local completion commit is identified with git log -1. Advance by feature milestones, not calendar dates. Later phases require separate instruction.

## Phase 1 — Engineering initialization

- [x] Inspect Node/npm/Git and immutable requirements.
- [x] Create project rules, specification, task list, README and environment example.
- [x] Initialize React/Vite/TypeScript layout and Fastify/TypeScript API.
- [x] Add real health route, truthful readiness, Zod config and safe errors.
- [x] Add development, production build/start and type-check commands.
- [x] Add PostgreSQL connection configuration and Drizzle migration framework.
- [x] Add API/unit/library compatibility and browser E2E tests.
- [x] Execute checks and record actual results (see docs/phase-1-verification.md).
- [x] Review staged changes and create local Git commit (identify via `git log -1`).
- [x] Report Phase 1 results and stop; next phase requires user instruction.

Verified: typecheck, 14 unit/API/compatibility tests, both builds, real Chrome development and production E2E. Missing database check/migrate both exit 1 as required; offline generation runs. Actual database/pgvector integration remains unverified without approved credentials. No external business service called; no deployment or push.

## Phase 2 — persistent AI chat (verified)

- [x] Read project rules/spec/tasks and current implementation.
- [x] Configure certificate-verified PostgreSQL TLS, optional CA and password encoding handling.
- [x] Explain root .env, Supabase Direct/Session pooler and backend-only LLM configuration.
- [x] Add conversations/messages schema and generate additive migration; inspect SQL.
- [x] Implement OpenAI-compatible adapter, bounded multi-turn context and safe provider errors.
- [x] Implement persistent chat routes, deduplication, same-conversation serialization and interrupted-generation handling.
- [x] Implement create/switch/history/reload chat UI and explicit failures.
- [x] Add mock-only adapter tests, offline API tests, real-DB integration and real-model E2E entrypoints.
- [x] Run npm run check: 29 tests plus typecheck/build pass.
- [x] Run credential-free development and production E2E: 1 test each passes with real local backend, no external integrations.
- [x] User confirms root .env configured and authorizes real model acceptance up to ¥1 total, no automatic retries.
- [x] Verify actual Supabase client TLS/certificate and pgvector; reviewed migration executed. Upstream pooler leg TLS status recorded separately.
- [x] Run real PostgreSQL persistence/concurrency tests (stub model): 2 tests pass.
- [x] Run real-model multi-turn chat/history/refresh/switch E2E: 1 test passes, using real Supabase and DeepSeek.
- [x] Record actual service results and create local Git commit after acceptance passes (identify with `git log -1`).

Actual acceptance: Supabase Session pooler + user-provided CA; encrypted and certificate-authorized client TLS verified; pgvector operation passes; additive migration executed successfully. Real PostgreSQL tests pass (2, stub model), and real DeepSeek browser acceptance passes (1, no model/database mocks). Acceptance fixes covered a language-sensitive marker assertion and conversation creation/list-loading races. Five model calls total across manual test runs; official pricing checked, per-call output capped at 1024 tokens, estimated cost below approved ¥1, exact billed amount not independently checked. No automatic retries. Pooler-to-Postgres SSL is not reported by pg_stat_ssl; local TLS socket is separately verified. No cloud SSL setting was changed. No raw credentials were inspected or printed. See docs/phase-2-verification.md.

## Phase 3 — PDF RAG (verified)

- [x] Read rules/spec/tasks and existing chat/database implementation.
- [x] Implement backend-only private Supabase Storage adapter; refuse public buckets.
- [x] Implement PDF size/MIME/header validation, durable uploaded/processing/ready/failed states and source download.
- [x] Implement PDF.js page extraction, 800-character chunks / 120 overlap with page/offset provenance; no OCR.
- [x] Implement independent configurable Embedding adapter, strict dimensions and model-space isolation.
- [x] Implement pgvector exact cosine retrieval, multi-document candidates and evidence-gated existing chat integration.
- [x] Generate/review/apply additive migration 0002; no destructive operations.
- [x] Implement lease-based single-worker recovery and atomic chunk publication.
- [x] Add upload/list/status UI, PDF-mode checkbox and persistent filename/page/quote display.
- [x] Generate 3 reproducible synthetic PDFs and visually verify all 5 pages.
- [x] Final npm run check: 45 tests, strict typecheck and both builds pass.
- [x] Real PostgreSQL integration: 5 tests passed; Storage/Embedding/LLM explicitly stubbed in this layer.
- [x] Default development/production E2E: 1 test each passes with real local API, external service credentials isolated.
- [x] User confirms Storage/Embedding configuration and authorizes Phase 3 real API calls; selected SiliconFlow BAAI/bge-m3, configured dimensions 1024.
- [x] Real Supabase private bucket metadata, upload/download SHA-256 match; this run's uniquely named probe object deleted successfully.
- [x] After user account check, exactly one minimal Chinese preflight returned HTTP 200 / 1024 finite nonzero dimensions / 11 tokens, no retry.
- [x] Real stored vector audit: 8 real chunks, configured and actual dimensions both 1024; 2 persisted citations verified against source records.
- [x] True RAG E2E passed: two-document facts, file/page citations, original download hashes, reload and insufficient evidence (47.6s).
- [x] Real blank/corrupt PDF failure states passed (18.2s); no chunks published for failed files.
- [x] Real normal-chat/reload/switch regression passed (22.3s).
- [x] Added and passed real-DB/stub-external shutdown cancellation and lease-resume regression (8.94s).
- [x] Final npm run check and development/production E2E pass after lifecycle fixes.
- [x] Cleaned this run's 6 Storage objects, 7 document rows, 10 chunks, 8 messages and 3 conversations; all baseline document/conversation IDs retained.
- [x] Record verified model/dimensions/results; create local commit after acceptance (identify with git log -1).

Latest acceptance is complete: SiliconFlow BAAI/bge-m3 / 1024 actually verified; no model substitution. Earlier 402 preflight stopped correctly and succeeded after user account/configuration check; exact original account cause not asserted. User approved combined ¥5 budget. Official BAAI/bge-m3 pricing is free; 4 measured DeepSeek calls total 2188 input / 367 output tokens, conservatively about US$0.00110 (overall estimate below ¥0.02; actual account bill not read). All model calls in completed tracked runs returned 200. No automatic model retry. Local-only; no login/public deployment or meeting module. See docs/phase-3-verification.md.

## Phase 4 — meeting analysis and risk todos (verified)

- [x] Read rules/spec/tasks, Phase 3 acceptance and relevant existing code.
- [x] Confirm existing private Bucket supports PDF + TXT; enforce backend UTF-8/MIME/extension/size limits independently.
- [x] Add source-numbered structured analysis, exact evidence validation, long-segment merge and unknown-field handling.
- [x] Add versioned meeting/risk/evidence/todo/draft/confirmation schemas; review and execute non-destructive migrations 0003/0004.
- [x] Add auto-analysis leased worker and failure states; preserve previous successful results on reanalysis failure.
- [x] Add content-hash deduplication, stable todo matching, CAS edits and draft-only version confirmation.
- [x] Add meeting upload/status, facts, risk/evidence, todo editors and draft preview to existing UI.
- [x] npm run check: 57 unit/API tests plus strict types/build pass.
- [x] Real PostgreSQL meeting integration: 2 tests pass with explicit stub Storage/LLM, including manual edits, reanalysis and invalid JSON failure.
- [x] Actual LLM risk case passes after JSON-mode/output-budget fixes; preserve initial format/evidence/truncation failures and publish no partial results.
- [x] Real no-risk, unknown owner/date, multiple risks/actions, long cross-segment and malicious-input cases pass in separate targeted runs.
- [x] Existing real PDF RAG: 2 passed; ordinary chat/reload/switch: 1 passed, under the same approved budget.
- [x] Real audit: 7 private originals/hash matches, 9 exact evidence rows, immutable confirmation snapshot and all drafts not_sent.
- [x] Update README/SPEC/acceptance record with actual results, fee telemetry limitations and retained OPEN issues.
- [x] Final credential-free development/production E2E: 1 passed each; strict types/57 tests/build passed.
- [x] Review staged scope and create local completion commit (identify with git log -1); stop before the next phase.

## Retained OPEN issues

- [ ] Investigate Phase 3's isolated, unreproduced upload HTTP 500. Do not claim resolved.
- [ ] Evaluate evidence-backed synthesis for RAG; current behavior is primarily verified extractive answering.

## Later phases — not started

- [ ] External service and deployment-network validation; credentials need approval.
- [ ] Protected workspace and persistent domain/task foundations.
- [ ] Protected public deployment (local chat acceptance completed in Phase 2).
- [ ] Durable cross-session memory.
- [ ] Confirmed, deduplicated email sending.
- [ ] Real web search.
- [ ] Chat-driven PPTX generation/download.
- [ ] Six-capability public acceptance, GitHub delivery and demo materials.
