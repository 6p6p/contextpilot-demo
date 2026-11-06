# ContextPilot specification

MVP v1.3.1：搜索提示和Zod明确6 claims/4 issues、每项4来源/每来源8引文；一次确定性无损规范化不增加模型调用，格式/绑定/语义错误分层。PPT分别建模主题/语言/受众/页数/要求，规划及发布校验正文必需事实，保留当前人工待办版本/未知字段与未获批提议。无SQL Schema或前端变更。check248、Corpus17、真实PG+外部全STUB12、生产E2E4通过；新Live及原生打开待授权，原失败记录保留。详见[v1.3.1记录](docs/mvp-v1.3.1-verification.md)。

MVP v1.3真实验收（2026-11-06）：0011已获批执行，旧68条PPT任务hash不变，CHECK改为3–30（应用默认上限20）。真实搜索FAIL（模型归纳结构超限，未发布回答）；两份真实5/10页PPT的私有Storage、下载、刷新/重启及鉴权PASS，但标题/培训内容、人工待办正文展示和缺口矛盾使业务内容FAIL。PowerPoint/WPS实际打开NOT_RUN，原文件保留。实际DeepSeek3、Tavily Basic2、Embedding/Resend0，保守费用≤¥0.211。check232、Corpus17、Chrome生产E2E4通过（业务UI为fixture）；先前真实DB+外部STUB11项非本轮Live全套。当前仍有业务阻塞，不Push/部署/清理/发信，详见[记录](docs/mvp-v1.3-verification.md)。

MVP v1.2：FIX-01–07已完成本地修复：官方多源证据与有界补搜、单次Demo登录/PPT可选选材、GFM表格、会议归档与讨论分类、邮件状态标题、PDF限定范围。check/test217、Corpus17、真实DB+外部替身10、生产浏览器E2E4通过；0010经批准仅新增meetings.archived_at。真实模型/搜索/PPT A/B仍待人工验收，未Push/部署/清理/发信。根因、真实快照边界、Run ID、迁移及复测见[本轮记录](docs/mvp-v1.2-verification.md)。

MVP v1.1 Phase B：对话中心布局、安全Markdown与容器滚动、服务端会话改名/归档、PDF软移除、待办忽略/恢复、草稿复核和记忆刷新反馈已实现。0009经批准仅新增3个可空字段，旧内容校验不变。check/test199、生产E2E3、真实DB+外部替身9项通过；来源/文件保留，未执行物理清理。旧Railway结构兼容但没有新管理语义，本轮不部署。详细范围、Run ID与待人工复测见[本轮记录](docs/mvp-v1.1-verification.md)，UX状态见[backlog](docs/ux-backlog.md)。

MVP v1.1 Phase A：新增受约束的官方多源版本/状态归纳、会议注入行过滤/行动分类、项目绑定记忆与当前上下文优先、最新待办草稿预览及旧版本复核保护。验证与局限见[本轮记录](docs/mvp-v1.1-verification.md)；真实模型人工复测仍待完成，邮件关闭，不Push/部署。

Stage B round1：记忆选择协议显式JSON/4096/non-thinking；只发布验证过的事实ID，不将reasoning内容当回答；空/结构化length响应在content校验前明确拒绝。网页优先官方候选，模型选稳定ID和服务端原文索引，旧quote模式仍逐字校验，时效/冲突约束不变。全站Demo认证状态以React Context供PPT展示，后端验证不变。PDF模式明确独占RAG；草稿仍由有风险的完成会议产生、确认不等于发送。变更与现场未验证边界见docs/stage-b-round1-fixes.md。

## Shared Supabase acceptance tracking (latest authorization)

允许在现有共享Demo库新增可精确追踪的合成记录，无新Schema/本地数据库/租户体系。每Run独立UUID、预登记业务根ID；会话及子对象按精确ID/外键归属，PDF/会议Worker限定假Storage origin/bucket与独立Embedding Space，memory/PPT按Run Scope；不启动完整应用Worker。真实DB与全部外部STUB明确区分，列表可见性不被误称隔离。

Manifest保留各表观测ID/关系、Storage后端/key/SHA、计数、基线哈希与结果，默认不清理；Dry Run仅SELECT，先检查跨记录引用，任何真实删除须在人工完成后另行确认。Stage A首轮8项PASS/59记录，额外重复Run因预检/连接超时未完成；完整当前状态见[Stage A验收](docs/corpus-stage-a-verification.md)。此前“数据库不写入”结论属于旧授权，未被静默当作当前结果。Stage B模型/Embedding/搜索/真实PPT仍需新授权，邮件保持关闭。

## Regression Corpus v1 quality contract

统一合成ORCHID-7421项目材料（3份PDF、会议TXT、带证据记忆、冻结MOCK搜索结果、5/10页管理汇报指令），Zod定义T01–T08稳定ID/版本、冻结时钟、预期事实、允许来源、禁止行为和分层通过条件。默认`npm run test:corpus`只执行确定性业务组件，支持单例；输入SHA按PDF原字节/文本LF规范固定，不自动更新Golden。真实Bug先加入复现，基准变更必须有理由和版本。

结果必须区分Unit、组件Integration/外部替身、真实DB、E2E和Live；NOT_RUN不进入通过率分母。源ID、物理页码/行号、原文、时效、风险/负责人/时间、内容分类与PPT结构均以结构化断言校验，不比较整段LLM措辞。详细契约见[Corpus规范](tests/corpus/v1/README.md)。

数据库测试门禁覆盖整个工作台，不只Worker：共库或不能证明独立且业务列表/检索不隔离时禁止写入。当前聊天/PDF/会议没有完整Corpus Scope过滤，因此本轮DB NOT_RUN、0新增；不因此改Schema/产品架构。付费测试先核实费率/用量/隔离并取得单独授权。当前离线181测试、生产E2E/smoke通过；同场景真实六能力和重启持久化尚未通过，见[验收记录](docs/corpus-v1-acceptance.md)。邮件发送仍关闭、无生产修改/推送/部署。

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

## Phase 6 — Email Delivery (restricted real acceptance verified)

This supersedes the historical draft-only implementation scope, but does not authorize actual sending until user configures and explicitly approves. Resend official SDK6.37.0, Node>=20 compatible with project Node24; no general mail platform, new worker framework, Redis, search/PPT or deployment. Credentials/backend sender/exact recipient allowlist remain server-only. EMAIL_DELIVERY_ENABLED defaults false. Public workspace protection remains required; local shared demo is not an authenticated multi-user application.

Migration0006 is additive: email_deliveries with immutable business snapshot, draft/confirmation/analysis FKs, global unique(draftId,version), unique stable provider idempotencyKey, scope/config queue index, RLS and state checks. User separately authorized actual migration and real-DB/stub-provider tests. Existing draft delivery_state column is a legacy placeholder retained unchanged; meeting detail derives current-version deliveryState from actual delivery records, default not_sent. History is authoritative and preserves prior-version outcomes.

Existing /confirm still only saves a version snapshot. POST /api/email-drafts/:id/send requires strict {version,confirmSend:true}; only a separate human UI confirmation creates the durable task. Transaction locks meeting then draft, rechecks confirmed state, current analysis, exact saved confirmation snapshot and allowlist; recipient/subject/body/sender/version/analysis/hash freeze in delivery. Permanent DB identity does not depend on browser request IDs, scope changes, or Resend's24-hour window. Repeated/concurrent same-version submissions return the same row, never retry failed/unknown automatically. Editing confirmed draft increments version and returns draft state; queued/processing/unknown blocks editing and new-version sends until outcome is known. Confirm/update lock order was aligned to prevent reanalysis races.

Worker reuses existing tick runner but intentionally has different mail recovery semantics. Claim queued via transaction FOR UPDATE SKIP LOCKED, revalidate version/snapshot/hash/analysis/allowlist, durably commit processing+attempt timestamp+token/five-minute lease BEFORE send. A processing row is never reclaimed; expired processing becomes unknown scoped to worker identity, even if provider idempotency has expired. A crash after processing commit but before HTTP can conservatively produce unknown without sending. One HTTP attempt only; SDK send uses fixed HTTPS Resend origin, stable key,20s abort signal, no automatic retry. Definitive provider rejection becomes failed; network/timeout/5xx/ambiguous409/malformed response becomes unknown. Late original response may resolve its own unknown via token fencing, without another send. DB failure after acceptance retains processing/unknown and attempts to save the providerID; never calls send again. Unknown with no ID requires manual control-panel correlation and cannot be cleared by editing to another version; no automatic/manual retry endpoint is exposed. This favors duplicate prevention over guaranteed delivery.

States queued/processing/accepted/delivered/failed/unknown are persisted and distinguished. Store provider messageID/requestID when available, safe error code, local requestID and timestamps. POST /api/email-deliveries/:id/refresh is read-only at supplier: retrieve existing email by known ID and persist last_event with CAS; no send. Failure to inspect retains status. Sender preflight: restricted onboarding test mode validates only the account-owner allowlist locally, not account permissions; verified mode calls domain retrieval and requires exact from-domain,verified status and sending capability. Actual account quotas/restrictions/API scopes need operator/control-panel verification; configured is not ready or delivered. No public webhooks required for this local phase; explicit polling supports delivery evidence without deployment.

GET /api/email/config reports only non-secret settings; POST /api/email/preflight checks sender settings, never sends; GET /api/email-drafts/:id/deliveries lists latest100 in server EMAIL_SCOPE. UI retains workbench design, saved-version preview, separate confirmation checkbox/button, status/history, immutable body preview and unknown/manual-check guidance. Provider text is not executable HTML. Source document/LLM content cannot call send APIs.

Restricted real acceptance subsequently completed with exactly2 authorized emails to the user-controlled account mailbox; both receipts confirmed. Mock/realDB+stub/browser+stub evidence is separate from provider/inbox delivery. No Phase6 completion Git commit before real business acceptance. Phase3 uploadHTTP500 remains OPEN. See docs/phase-6-verification.md.

Phase6 final acceptance: the user explicitly authorized <=2 real emails, onboarding@resend.dev to the configured account mailbox only, with first-receipt confirmation before the second. After initial read-only401 stopped without send, reload/preflight returned200. Exactly2 external sends completed for the same draft v1/v2; old/unconfirmed version attempts rejected409, duplicate/concurrent confirmations/submissions reused one record per version. Both supplier/database statuses delivered and both receipts independently confirmed by the user. Final audit from a new database connection verified the two IDs/statuses and root EMAIL_DELIVERY_ENABLED=false. Only isolated test processes temporarily enabled delivery; no other model/Storage calls. Future emails require separate approval; no next module, deployment or remote push. Historical pending statuses in verification record are preserved as chronology.

## Phase 7 — Web Search & Tool Integration (verified)

Phase 7 real acceptance completed after baseline d85dde3; feature milestones only. Details and retained failures: [verification](docs/phase-7-verification.md).

- Backend-only Tavily adapter; no new dependency/framework. Configure `TAVILY_API_KEY`, `TAVILY_BASE_URL=https://api.tavily.com`, `SEARCH_TIMEOUT_MS=10000` (1000–15000), `SEARCH_MAX_RESULTS=5` (1–5), `SEARCH_MAX_CALLS=20` (1–100). Missing key fails explicitly. Additive migration 0007 applied and column defaults/pgvector compatibility verified.
- Chat `searchMode=auto|required|off`, new requests default auto; historical messages default off. Auto uses Chinese/English freshness/news/price/weather keywords. Required searches, off never searches; explicit freshness questions with off report inability to confirm current facts. Keyword detection is imperfect; use required for implicit freshness questions.
- One basic search per selected turn, no retry, no raw-page fetch or Tavily answer. Per-process attempted-call cap resets on restart; it is not a durable billing quota. Persisted request dedup prevents replay from searching again. Snippets bounded to 5 × 1600 characters. Search evidence uses request-local JSON/non-thinking mode (DeepSeek host only), max4096 output tokens; ordinary chat settings stay unchanged.
- External search receives only the normalized standalone current question <=200 characters, with conservative private-context/sensitive-pattern rejection. No conversation history, PDF/meeting text or memory retrieval data is sent to Tavily. Screening cannot detect all undisclosed private facts; enter only public questions. No model query rewriting.
- Model selects evidence; server checks actual source IDs/exact quotes. Only verified quotations are used in answers; conflicting source claims stay separately attributed. All returned result metadata is retained, including unselected results labeled “仅检索”; selected evidence is “已引用”. A source may have multiple quotation cards. Title/URL/snippet/query time/optional provider publication date persist in messages.web_sources. Missing dates remain null. This is extractive answering; relevance and factual truth still require review, not free-form synthesis.
- Existing PDF and memory paths remain; PDF+search uses separate sections. Failures do not claim successful current information. UI provides mode, pending state, failure codes, links and citation history; stage feedback is combined, not streamed. Web data has no action executor or email privileges.
- Actual acceptance: 5 Tavily Basic calls (all HTTP200),18 DeepSeek calls,6 BGE-M3 calls; search counts include preflight and first failed model-output flow. Conservative total estimate ~CNY0.53; cumulative pre-request reservation CNY1.390012 < approved3. Account invoice not read.
- Required/auto search, ordinary/off zero-search, replay dedup, accessible Node.js sources, exact evidence, refresh/restart and complete result metadata passed. Chat/RAG/meeting/cross-conversation memory live regressions passed through generation and persisted evidence audits. Offline103 tests/types/build; full realDB/stub20 passed, expanded search suite2 passed (one repeated, one additional case). Default browser dev/prod results are recorded in verification.
- Real429/quota exhaustion/timeout/empty/malicious-data cases are isolated mocks; realDB failure persistence is separately stubbed. Do not exhaust actual quotas for testing. No new email, Resend/root config change, secret disclosure, provisioning, deployment, remote push or PPT. Phase3 upload HTTP500 and evidence-backed RAG synthesis evaluation remain OPEN.

## Phase 8 — AI PowerPoint Generation（已正式关闭）

保持 TypeScript 模块化单体、PptxGenJS4.0.1、现有任务 Worker/PostgreSQL/私有 Supabase Storage。聊天明确生成指令触发；支持中文16:9商务模板，总页数5–10（含封面/参考资料，默认7）。两阶段：有界来源检索与Zod结构化规划 → 确定性渲染；不执行模型代码，不缩小字体掩盖溢出。

来源复用 PDF、显式选择的会议及人工编辑待办、长期记忆；联网只接收独立公共搜索词，不拼接私有上下文。事实逐字匹配完整来源单位，分析/建议单独标注；来源不足不补造。官方来源限制按当前任务启用，Node.js只接受HTTPS精确nodejs.org，未识别的官方机构明确报错；普通任务不受此域名限制。下载前重新核验保存规划及私有文件SHA/结构。

任务、来源、规划及文件校验信息持久化；PPT_ACCESS_KEY（后端随机32–128字符）、PPT_SCOPE、PPT_MAX_TOKENS。PPT-only共享口令签发8h HttpOnly/SameSiteStrict Cookie，生产Secure；不是全工作区身份系统。UI沿用聊天面板，支持解锁、资料选择、状态/失败、跨会话历史和鉴权下载。现有其他模块边界不变，不能据此公开部署。

已批准的增量0008已应用。本次修复发布不新增迁移：context.artifactPublication使用Zod/TypeScript保存父文件、候选私有路径/SHA/大小/规划摘要、状态与时间。锁行登记pending后不可变上传、实际读回验证，再锁行核对父版本并事务切换路径/SHA/大小/规划及published状态。jsonb_set仅修改发布记录，不覆盖其他context；旧对象保留，失败可幂等恢复。仅本次B/D修复的内部工具，无新发布HTTP接口或通用版本系统。

最终A v1=5页、B v2=10页、C v1=5页、D v2=10页，四份均ready，本地/Storage/鉴权HTTP下载SHA一致，独立服务重启后再次下载一致。B7过度分析与D9非官方截断陈述整条删除；其他事实、负责人、日期和风险未改。A/C未重生成/未更新。B/D原对象与SHA保留。四份本地最终PPTX及证据位于忽略目录.acceptance/phase8-live；完整SHA、旧版本和命令记录见docs/phase-8-verification.md最终验收节。

测试：npm run check通过143项单元/API/兼容性测试、类型检查与构建；PPT真实数据库/外部替身10项通过，发布4项专项复跑通过；其余模块21项初跑19通过2项连接超时，邮件/会议7项单独复跑全通过。默认开发/生产E2E各1通过；真实只读鉴权/四文件下载/进程重启E2E1通过。来源持久化审计4任务/32份所用快照通过。四份实际PPTX独立包/布局校验0问题。模型/Embedding/搜索本轮0调用，邮件未发送，EMAIL_DELIVERY_ENABLED=false。

人工验收：用PowerPoint/WPS打开本地A/B/C/D（5/10/5/10），确认无修复提示；逐页检查中文字体、标题/表格换行、遮挡与备注引用。重点复核B7、D9已删除陈述及C/D人工负责人/日期。用户已确认PowerPoint/WPS原生打开通过，Phase8正式关闭；程序检查不替代这一用户确认。Phase3偶发上传HTTP500降为观察项；Phase9按用户新授权推进。

## Phase 9 — Railway Demo 本地部署准备（已完成，未上线）

本轮新增Railway费用授权US$0；不创建Project/Service、不升级/绑卡、不推送/连接GitHub触发部署、不开放公网。取消独立Phase9A，不做生产级审计/复杂压测/历史故障专项。Phase8已由用户确认云端、自动化及PowerPoint/WPS原生打开通过并正式关闭。

实现：DEMO_ACCESS_KEY全站后端HMAC口令门禁（包含AI、上传、下载和其他业务API），HttpOnly/SameSiteStrict/生产Secure Cookie，登录与共享请求/写/上传次数限制，所有模型/搜索/向量实例共用尝试/分钟/并发及体积限制。旧PPT凭据不能绕过全站验证；全站会话可直接使用PPT。前端仅在登录后挂载业务工作台，不存储口令。生产/非回环地址缺口令或生产误开邮件会失败启动。

railway.json使用Railpack仓库根构建npm run build（依赖由Railpack Install阶段安装，.npmrc确保包含devDependencies），直接node dist/server/apps/api/src/server.js启动，单副本，Fastify托管SPA/API及现有模块Worker轮询；HOST生产默认0.0.0.0，PORT使用平台值。/api/health为存活200，/api/ready仅数据库可达才200，其他情况503；响应x-request-id、基础日志不含query/Cookie/Authorization。业务数据和文件继续在Supabase，无生产.acceptance/临时目录依赖，无新数据库/Volume/Redis/独立Worker服务或SQL迁移。

构建后npm run deploy:check做只读配置presence检查（不证明凭据有效）；npm run db:status只SELECT迁移hash/时间，无自动迁移。此前已验收0008；本轮不读取真实.env/数据库/Storage，不把历史结果冒充本轮云端验证。

验证：Node24.15.0/npm11.12.1，npm run check通过155项测试/类型检查/两个构建；开发和生产Chrome E2E各1通过；npm run test:production:smoke通过配置齐备/缺失、3种启动拒绝、数据库未配置/不可达、编译SPA、鉴权/429、日志脱敏及关闭。API未授权上传/下载/AI请求401，文件超限413；生产E2E深链/刷新/退出和移动端检查通过。无真实业务API、数据库/Storage调用、资源新增或费用。

当前无PATH可用Railway CLI，也无原账号关联配置；新增railway.json不是已创建项目。账号/是否有可复用Service未验证。若控制台确认无可复用，下一轮需另行授权一个Project/Node Service。Free方案是否足够当前Demo待实际验证；不能把免费credit当稳定长期承诺。后续账号、GitHub连接、变量、费用和验收步骤见[Railway部署说明](docs/railway-deployment.md)；本轮证据与分级问题见[Phase9准备验收](docs/phase-9-verification.md)。

Phase3上传HTTP500降为观察项，不阻塞；历史数据库连接超时只在实际复发时排查，不引入重试框架。EMAIL_DELIVERY_ENABLED=false，真实发送仍需单独授权。进程内调用限额重启会重置，不是账单硬上限；Cookie统一失效可轮换共享口令，不增加多用户/RBAC。

本地准备测试通过后本地提交，停止等待审查。真实Railway部署、实际Supabase连接/文件读写、平台Worker重启/六功能、公网网址与费用验证均未执行，需要下一轮明确授权。

### Railway TLS 信任链修复（2026-11-05，待发布）

用户报告公网API500，容器pg.connect失败SELF_SIGNED_CERT_IN_CHAIN。已审查公开Supabase Root2021 CA并入库prod-ca-2021.crt；npm build新增复制到dist/server/certs/prod-ca-2021.crt。连接池仍rejectUnauthorized=true，沿用pg/Node默认主机名验证；URL所有query/hash仍被拒绝。没有改业务/SQL/数据/密钥。

后续获批部署时：DATABASE_SSL=true、DATABASE_CA_CERT=/app/dist/server/certs/prod-ca-2021.crt，DATABASE_URL不带sslmode/sslrootcert等query，保留真实DNS主机。先容器npm run db:tls严格TLS+SELECT1，通过后再/api/ready与鉴权业务API。不要关闭TLS校验。当前check157、生产smoke与生产E2E1通过，CA构建复制SHA一致；真实Railway握手/SELECT1/API尚未验证，未push/重新部署/修改变量。完整记录见docs/phase-9-verification.md末尾。

### 聊天搜索事实准确性修复（2026-11-05，离线验证）

官方要求按问题对应机构映射，不以nodejs.org作通用规则；聊天一次Basic搜索增加域名/查询日期提示，优先近期官方证据。结论必须逐字匹配来源并通过权威/时间检查，再显示来源与查询时间；旧证据仅供对照，缺失/冲突明确无法确认，不编造版本或日期。全部实际元数据与既有引用ID约束保留。PPT原搜索调用不传新增可选提示，行为保持不变；未改数据库、邮件或PPT。

新增7个固定Mock回归，npm run check通过164测试/类型/构建，生产smoke和生产E2E1通过。未付费搜索/模型调用，未访问真实数据库，暂不push/部署；记录和限制见docs/phase-9-verification.md末尾。
