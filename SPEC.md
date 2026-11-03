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

## Phase 2 — approved scope and contract

Phase 2 supersedes the Phase 1 prohibition on chat implementation only. Implement Supabase PostgreSQL connectivity, additive conversation/message migrations, an OpenAI-compatible non-streaming adapter, persistent multi-turn chat, history loading and conversation switching. Do not implement PDF/RAG or other business modules.

Backend configuration: DATABASE_URL, DATABASE_SSL (default true), optional DATABASE_CA_CERT; LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, LLM_TIMEOUT_MS (45000), LLM_MAX_TOKENS (1024). Root .env only. Remote PostgreSQL requires TLS with certificate validation. No SSL query overrides in DATABASE_URL. Password must be percent-encoded once. Session pooler supports local IPv4 when Direct IPv6 is unavailable. No Supabase frontend SDK or API keys required.

- POST /api/conversations `{title?:string}` → 201 `{conversation}`.
- GET /api/conversations → `{conversations}` (100 most recently updated).
- GET /api/conversations/:id/messages → `{messages}` (200 most recent, chronological).
- POST /api/conversations/:id/messages `{clientRequestId:uuid,content:string}` → `{messages}` containing this turn's persisted user/assistant pair. Upstream failure is represented by persisted assistant status=failed and safe errorCode. HTTP 200 does not by itself prove generation succeeded.
- Missing DB/model → explicit 503; invalid input → 400; missing conversation → 404; busy/conﬂicting request ID → 409. Unexpected database exceptions remain sanitized 500.

Data: conversations(uuid,title,createdAt,updatedAt); messages(uuid,conversationId,clientRequestId,ordinal,role,content,status,errorCode,model,createdAt,updatedAt). UUID keys, restricted FK deletion, unique per-conversation ordinal and request/role. RLS enabled without Data API access policies. Backend uses privileged server connection; single shared local workspace, no tenant/member management.

Generation: lock conversation during short preparation transaction; persist user and pending assistant, release lock, call provider, persist success/failure. No automatic provider retries. Duplicate request ID with same content returns existing rows; changed content conflicts. Reject another active turn in the same conversation. A pending reply older than 90s becomes failed on the next history/send request, enabling recovery after process interruption; it is never automatically regenerated. All records stay in DB. No durable jobs required for this bounded synchronous operation.

Context: up to 20 completed messages and 24000 characters, current conversation only. User input limit 4000 characters. This is persisted chat history, not cross-session fact retrieval. RAG/memory contracts and model adapter are extension seams only; no retrieval or tool execution is present.

Acceptance: real DB connection and pgvector operator; reviewed migration applied; reads from a new connection see writes; real model replies remember a unique marker in a follow-up; refresh and conversation switching retain messages. Offline mocks are separate evidence only. Public deployment remains prohibited until access protection is implemented and approved.

## Phase 3 — PDF RAG (real external acceptance verified)

Use existing React/Fastify/PostgreSQL/pgvector and PDF.js; no new vector DB or AI framework. Original PDFs live in an existing private Supabase Storage bucket. Backend alone has Storage and Embedding credentials. Do not assume DeepSeek chat provides embeddings. Text-layer PDFs only, maximum 6 MiB/100 pages/200000 extracted characters; no OCR. Raw application/pdf upload avoids a multipart dependency.

Tables: documents stores original object identity, checksum, status, embedding space/dimensions, attempts and processing lease. document_chunks stores document FK, physical 1-based page, normalized page text offsets, chunk text, embedding and model-space fingerprint. messages gains knowledgeMode and persisted citation snapshots. Existing messages default false/empty sources. New tables enable RLS without frontend policies.

Chunk size 800 UTF-16 characters, overlap 120, page-local; no chunk crosses physical pages. Normalize horizontal whitespace but retain line breaks. Target plain vector column with SQL vector_dims CHECK; dimensions configured 1–4096 and validated against each actual API response. Space fingerprint hashes endpoint/model/dimensions. Query only ready chunks matching current space/dimensions. Exact cosine scan, top 8, minimum similarity default 0.5; no ANN index for this small Demo. Threshold is model dependent and requires real acceptance calibration.

Lifecycle: uploaded → processing → ready/failed, with separate storageReady guard. Save original first; only then enqueue. SQL transaction atomically publishes all vectors and ready status. One worker per process, row lock skip-locked, five-minute lease renewed every 30s; interrupted work may resume once (max 2 attempts), which can repeat paid embedding calls. API/provider errors fail visibly with safe code/message, not automatic retries. Uploaded but unconfirmed objects older than five minutes become failed. Old model spaces stay persisted but excluded; changing model/storage config requires restoring config or re-uploading queued files. No deletion endpoints.

API: GET /api/documents lists last 100 records; POST /api/documents?filename=NAME with application/pdf bytes returns 202 {document}; GET /api/documents/:id returns durable processing status; GET /api/documents/:id/download proxies original privately without sending Storage credentials. No signed public URL is needed. Local-only until workspace protection is implemented.

Chat POST adds knowledgeMode=false by default. PDF mode uses the current standalone question to embed/retrieve, not conversational query rewriting; ordinary chat remains unchanged. LLM selects exact quotes and source IDs in JSON. Server rejects unknown IDs or quotes not present verbatim in candidate text; authoritative filename/page comes only from DB. Answer is rendered from verified quotations, discarding model prose, so no unsupported generated facts are shown. No candidates or empty evidence returns explicit insufficiency. This is conservative extractive knowledge answering, not arbitrary abstractive report generation. Semantic relevance still requires real model tests; provenance validation cannot certify that a supplied PDF is factually true. Documents are untrusted input; they have no tool or business-action privileges. RAG pending expiry is 180s, ordinary chat 90s.

Acceptance includes actual private Storage/hash persistence, actual Embedding/dimensions, actual cosine SQL and multi-document questions, evidence and insufficiency, no-text/corrupt failures, lease recovery, persistent source reload, and ordinary chat regressions. Distinguish mocks from real providers. Test fixtures and regeneration instructions are versioned. No Phase 3 completion commit until real gates pass.

Verified configuration: SiliconFlow BAAI/bge-m3, 1024 dimensions; default threshold 0.5 passes synthetic multi-document/negative acceptance. Shutdown aborts in-flight storage/embedding fetches, retains interrupted processing leases and waits for worker completion before pool close. Fastify lifecycle timeout is 30s; acceptance process allows 15s before forced termination. Real live tests use opt-in non-secret ID manifests and token telemetry, with bounded calls and no automatic provider retries. User-approved cleanup removes only tracked newly created records, refuses baseline ID overlap/external citation references, and retains original baseline IDs. No user-data cleanup endpoint is exposed.

## Phase 4 — meeting analysis (real acceptance verified in targeted runs)

Feature milestones only; no calendar deadline. Reuse private Storage (bucket privacy checked every operation), existing chat model adapter and leased-worker runner. Storage put accepts optional text/plain while retaining application/pdf default. New meeting tables preserve raw source/checksum, status and numbered text, analysis versions, risks/evidence, durable todos and draft/confirmation snapshots. Existing PDF tables/behavior are not replaced.

TXT: strict UTF-8/BOM handling, normalize CRLF to LF, preserve physical blank lines; require .txt + text/plain, nonempty, at most 1 MiB, 64000 UTF-16 units, 4000 lines, 2000 units per line. Segment by whole lines at ~8000 units with two-line overlap (max 16 segments). Each segment extracts bounded structured findings; a final pass merges all findings and cross-segment conditions, considers later resolutions. Source actions and metadata facts are unioned so summary omission does not silently discard extracted actions. No transcript truncation. Merge output over schema bounds fails explicitly. All fact/action values and owner must be verbatim in cited source; absolute deadlines require explicit full source dates (ISO or Chinese year/month/day normalized server-side). Relative/unknown deadlines remain null. Risk descriptions/impacts are labeled potential assessments with exact source evidence; semantic correctness still requires human review and live tests.

Lifecycle uploaded/processing/ready/failed; storageReady protects incomplete upload; five-minute renewable leases; one interrupted recovery (max 2 attempts); API/format/evidence errors fail without automatic retries. Versioned analysis/risks/todos publish transactionally. Failed reanalysis preserves previous successful version, clearly labeled. Duplicate raw bytes return the original meeting without a second model job. Reanalysis increments requestedVersion. Extractive task identity is anchored to source span/task; overlapping substring-equivalent tasks reuse existing IDs. User-edited owner/date/status are never overwritten. Risks lacking an explicit action receive a clearly labeled risk-followup suggestion, owner/date unknown; it is not misrepresented as a meeting decision. Historical todos remain visible, not auto-deleted.

Structured result: topic/date/location nullable fact+evidence; participant/topic/decision arrays; risks(type,level,description,impact,evidence[]); actions(task,owner?,dueDate?,evidence). Zod validates JSON; quote and 1-based global line bounds are verified before publishing. Transcript/LLM text is untrusted, not executable instructions. Meeting output allowance is separate MEETING_MAX_TOKENS=8192 and MEETING_TIMEOUT_MS=90000; ordinary chat/RAG unchanged. Meeting requests opt into JSON response format with an explicit example. A length-truncated structured response fails explicitly; no partial JSON repair or automatic model retry.

API: GET/POST /api/meetings, GET /api/meetings/:id, GET /api/meetings/:id/transcript, POST /api/meetings/:id/reanalyze, PATCH /api/meeting-todos/:id, PATCH /api/email-drafts/:id, POST /api/email-drafts/:id/confirm. User edits use version compare-and-set. Confirmation requires explicit saved recipients, current analysis and exact draft version; immutable snapshot persisted, deliveryState always not_sent. No send API, mail provider or address inference. Reanalysis never replaces an existing draft; stale drafts require explicit review/save to bind current analysis before confirmation.

Live budget is ¥5 combined. Opt-in instrumentation reserves conservative text token/output cost before each request, aggregates reservations across acceptance processes and stops before budget exhaustion. Any failed provider response stops further instrumented calls; no automatic provider retries. Instrumentation only covers requests made by the instrumented acceptance process; another running local worker can claim durable jobs, so its partial ledger is not a complete account bill. Unit/API, real-DB/stub-external and actual provider/browser acceptance remain separate.

Carry-forward OPEN issues: Phase 3 isolated upload HTTP 500 is not reproduced or declared fixed; RAG remains verifiable extractive answering, and evidence-backed synthesis requires later evaluation. Public workspace protection is still required before deployment.

## Phase 5 prerequisite review

Phase 5 long-term memory is authorized by the user, superseding the Phase 4 exclusion for this new phase. Before memory implementation, expired-job cleanup now uses the same Storage/embedding configuration boundary as claiming. Claim and publish use database row locks and lease tokens; lease recovery may repeat external calls. Same-configuration API processes share a queue regardless of port/NODE_ENV; live acceptance requires one observable worker instance. No new task framework or migration in this prerequisite milestone. See docs/phase-5-verification.md; memory acceptance is still pending.

## Phase 5 — provenance-preserving long-term memory

User approved implementation after prerequisite commit 7341aa9. Reuse TypeScript/Fastify/PostgreSQL/pgvector and the existing leased worker runner; no new dependencies. Incremental migration 0005 creates memory_jobs and memories, adds messages.memory_sources snapshots, enables RLS and source/identity constraints. No destructive migration or automatic startup migration.

New user chat messages enqueue memory_jobs within their save transaction, independently of assistant generation success. Successful meeting analyses enqueue within the publication transaction, including reanalysis versions. Historical pre-feature records are not bulk processed automatically; reanalyzing a meeting triggers extraction. Duplicate chat requests return prior rows without enqueuing duplicate jobs. Jobs expose queued/processing/ready/failed plus sanitized errors through GET /api/memories. Missing model stays explicitly unconfigured and queued, never pretends extraction succeeded. No automatic retry of format/provider failure; interrupted expired leases recover once (two attempts total).

Chat extraction uses the existing JSON model adapter, capped at 4096 output tokens and 12 facts per message. Only user messages are sources; assistant text is never ingested. Meetings deterministically reuse previously evidence-validated topic/date/place/participants/topics/decisions/actions, excluding model risk/impact assessments. All facts are revalidated with Zod, exact content within exact quote, and 1-based source line bounds. Categories: person/time/place/topic/event/decision. Date text is never resolved or assigned a year; observedAt is source record time, not event time. Unknown fields create no inferred facts. Instruction-like quoted content is conservatively excluded; prompts label all source material untrusted and no action executor is exposed. Exact provenance verifies attribution, not factual truth of a user's statement.

Each fact retains sources(sourceType, sourceId, parentId, observedAt, quote/lines). Source ID is a user message or immutable meeting analysis version; parent ID is conversation or meeting. Fingerprint hashes kind/content/quote with Unicode NFC, scoped to the source conversation/meeting. Exact duplicates within that context reuse the fact and append distinct source references transactionally. Repeated jobs/lease takeovers cannot create duplicate identities. Same-name facts in different contexts are not merged; conflicting dates and decisions remain separate records. Similar paraphrases are not automatically declared equivalent; conservative deduplication avoids erasing provenance or conflating people.

Memory worker uses server-owned MEMORY_SCOPE (default demo), transaction row locks/SKIP LOCKED, random lease token, five-minute lease/30-second renewal and fenced atomic publication. Embedding failure publishes no partial facts. Source chat/meeting data is unaffected by extraction failure. Retrieval and listing filter the same scope; callers cannot set scope or enqueue arbitrary source IDs. This remains one local shared demo workspace, not authenticated multi-user isolation. Public deployment is prohibited until protection exists. Changing MEMORY_SCOPE isolates memory data/queues but does not retrofit tenancy into existing chat/meeting/PDF tables. Other same-config PDF/meeting workers must be stopped for live acceptance.

Optional existing BGE-M3 embeds fact plus quote, batches <=16. Store model-space fingerprint/dimensions; retrieval excludes other spaces. Query first uses bounded lexical prefilter, then exact cosine fallback only if needed. It expands to related facts from the same original sources (not entire conversation histories), prioritizes requested types and caps context at six facts, three provenance entries per fact and 6000 serialized characters. Current conversation context remains <=20 messages/24000 characters; ordinary answer output cap remains unchanged. No unbounded history stuffing.

Existing ordinary chat performs recall, asks the existing LLM to choose cited IDs, rejects unknown IDs and renders only selected source quotes/content. This is conservative historical evidence answering, not free-form synthesis. Empty selection returns to the existing chat model with explicit absence of reliable historical evidence, so general conversation still works. PDF mode keeps its existing evidence flow. Stored answer citations survive reload. No reliable historical facts means no fabricated factual answer; model semantic selection still needs live/human evaluation.

UI: existing workbench memory section lists latest 100 facts and extraction jobs, shows type/content/source IDs/quotes/raw line numbers/source record timestamps, links to original transcript/history, polls with abort/cleanup, and displays answer citation snapshots. No knowledge graph/editor/admin platform. Acceptance layers and retained failures are in docs/phase-5-verification.md. Phase 3 upload HTTP 500 remains OPEN.
