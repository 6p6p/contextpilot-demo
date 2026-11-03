# Development tasks

Phase 1 and Phase 2 are authorized. Phase 2 is in progress; later phases require separate instruction.

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

## Later phases — not started

- [ ] External service and deployment-network validation; credentials need approval.
- [ ] Protected workspace and persistent domain/task foundations.
- [ ] Protected public deployment (local chat acceptance completed in Phase 2).
- [ ] PDF knowledge retrieval.
- [ ] Meeting risks, evidence and todos.
- [ ] Durable cross-session memory.
- [ ] Confirmed, deduplicated email sending.
- [ ] Real web search.
- [ ] Chat-driven PPTX generation/download.
- [ ] Six-capability public acceptance, GitHub delivery and demo materials.
