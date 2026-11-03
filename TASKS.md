# Development tasks

Only Phase 1 is authorized. Later phases are planning entries, not permission to implement.

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

## Later phases — not started

- [ ] External service and deployment-network validation; credentials need approval.
- [ ] Protected workspace and persistent domain/task foundations.
- [ ] Real chat/history.
- [ ] PDF knowledge retrieval.
- [ ] Meeting risks, evidence and todos.
- [ ] Durable cross-session memory.
- [ ] Confirmed, deduplicated email sending.
- [ ] Real web search.
- [ ] Chat-driven PPTX generation/download.
- [ ] Six-capability public acceptance, GitHub delivery and demo materials.
