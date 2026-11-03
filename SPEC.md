# ContextPilot specification

## Purpose and source

AI decision workspace Demo for 南京信人智能. The immutable source is [docs/assignment.txt](docs/assignment.txt). Final delivery: public Web application, GitHub source, README and demo materials. This is not production SaaS.

## Required capabilities (later phases)

1. Real multi-turn AI chat with persisted history.
2. Uploaded PDF knowledge retrieval with source/page citations.
3. Automatic TXT meeting analysis, risks with original evidence and persisted todos; editable email draft and explicit confirmation before real sending.
4. Cross-conversation durable memory of people, times, places and topics from chat and meetings, with provenance.
5. Real search for time-sensitive questions, with sources and retrieval time.
6. Explicit chat instruction produces downloadable valid PPTX.

All six require real integration acceptance. History storage alone is not memory retrieval; email draft alone is not sending; an outline alone is not PPTX.

## Architecture

- One repository/package, React + Vite frontend in apps/web; Fastify API in apps/api; shared Zod contracts in shared.
- TypeScript strict mode. PostgreSQL + pgvector; Drizzle schema and versioned SQL migrations in drizzle.
- Private object storage for all uploaded/generated files. External LLM, embedding, search, email adapters in later phases.
- Single protected demo workspace. Authentication is a later phase and a prerequisite for public business access.
- Persistent recoverable database-backed jobs only for necessary long operations. No Redis, Multi-Agent or microservices.
- Email confirmation binds exact content version and recipient list; deduplication and delivery history are mandatory.
- Untrusted content cannot authorize actions. All secrets stay server-side.

## Phase 1 approved scope

Environment/toolchain checks, docs, frontend/backend skeleton, actual browser health request, environment validation, normalized API errors, development/build scripts, PostgreSQL connection configuration, migration framework, Vitest and Playwright.

No chat, RAG, uploads, meetings, memory, search, email or PPT business implementation. Library smoke tests do not count as business features. No deployment, remote push, paid service call or resource creation.

### API contract

- GET /api/health → 200 `{status:"ok",service:"contextpilot-api",database:"not_configured"|"not_checked"}`. Process liveness only; never asserts database connectivity.
- GET /api/ready → executes `select 1` when configured. 200 `{status:"ready",database:"connected"}` or 503 `{status:"not_ready",database:"not_configured"|"unavailable"}`.
- Unknown API route → 404 `{error:{code:"NOT_FOUND",message},requestId}`.
- Invalid request → structured 4xx; unexpected exception → sanitized 500 with requestId. No exception text or credential values returned.
- Frontend validates health response using shared Zod contract, shows loading/success/failure, allows retry; 5s timeout.

### Acceptance

Both dev servers start; real browser opens layout and receives API health; no DB config displays unconfigured; types/tests/build succeed; README includes reproducible commands. Actual DB and vector extension are explicitly unverified without credentials.

## Initial product boundaries (review again before business implementation)

Text-layer PDF (proposed 10 MB/100 pages), UTF-8 TXT (proposed 1 MB), fixed Chinese business PPT template (proposed 5–10 pages), controlled email recipients. Scan/OCR support is undecided. No audio transcription, online PPT editor, enterprise administration or automatic todo execution.

## Quality gates

API integration tests cover real Fastify routes, missing DB readiness and safe errors. Runtime compatibility tests cover PDF text extraction, PPTX buffer generation and Drizzle vector SQL without network. E2E uses real Vite/API processes, no response interception. Live service acceptance remains separate.
