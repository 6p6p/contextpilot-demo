# Development tasks

MVP v1.2：FIX-01–07已完成本地修复：官方多源证据与有界补搜、单次Demo登录/PPT可选选材、GFM表格、会议归档与讨论分类、邮件状态标题、PDF限定范围。check/test217、Corpus17、真实DB+外部替身10、生产浏览器E2E4通过；0010经批准仅新增meetings.archived_at。真实模型/搜索/PPT A/B仍待人工验收，未Push/部署/清理/发信。根因、真实快照边界、Run ID、迁移及复测见[本轮记录](docs/mvp-v1.2-verification.md)。

MVP v1.1 Phase B：对话中心布局、安全Markdown与容器滚动、服务端会话改名/归档、PDF软移除、待办忽略/恢复、草稿复核和记忆刷新反馈已实现。0009经批准仅新增3个可空字段，旧内容校验不变。check/test199、生产E2E3、真实DB+外部替身9项通过；来源/文件保留，未执行物理清理。旧Railway结构兼容但没有新管理语义，本轮不部署。详细范围、Run ID与待人工复测见[本轮记录](docs/mvp-v1.1-verification.md)，UX状态见[backlog](docs/ux-backlog.md)。

MVP v1.1 Phase A：新增受约束的官方多源版本/状态归纳、会议注入行过滤/行动分类、项目绑定记忆与当前上下文优先、最新待办草稿预览及旧版本复核保护。验证与局限见[本轮记录](docs/mvp-v1.1-verification.md)；真实模型人工复测仍待完成，邮件关闭，不Push/部署。

## Stage B round1 defect repair — 2026-11-06

- [x] 只读核查原Run：16消息、8记忆任务ready、10条带来源事实；不修改原业务数据。
- [x] 新增5项固定协议/脱敏测试；初跑复现后修复，Golden预期不变。
- [x] BUG-01选择器参数/截断分类与安全诊断，BUG-02编号原文选项/官方前置筛选；校验不放宽。
- [x] BUG-03真实DB中新会话off/PDF模式路由与来源验证；不重构记忆。
- [x] BUG-04移除前端重复认证探测，BUG-05完成会议草稿顶部入口；后端权限/邮件关闭不变。
- [x] check/test186，生产E2E2，受控DB8通过；新Run新增66记录、旧哈希变化0，全部保留。
- [x] UX v2六项登记，原始现场错误响应不可还原的限制明确记录。
- [ ] 原问题真实模型/搜索成功与PPT/会议草稿现场复测；不把Mock通过当关闭缺陷的证据。

本地提交后停止等待人工，不Push、不部署、不真实发信、不清理旧数据。

## Current — Shared Supabase Stage A / manual Stage B

- [x] 审查Schema/服务/Worker，按新授权执行共享库受控写入；无Docker/本地库/Schema变化。
- [x] 首轮T01–T08真实DB+外部替身8项通过；Run49badde9-63d3-4963-8ce1-4d5bef94b047新增59记录、7本地对象，既有哈希变化0。
- [x] 精确ID/外键Manifest，原子保存、STUB物件写前登记、独立进程读取/下载恢复、版本幂等与原版保留。
- [x] 首轮只读Dry Run：59候选、外部引用0、缺失0，未删除；所有数据保留。
- [x] Stage B统一材料副本、输入、预期、证据与人工指南；更新最低调用估算与待审批¥6方案。
- [x] check及单独test181通过；新脚本严格类型检查通过。
- [ ] 额外独立Run T01复跑未完成：hook超时/实际连接超时，后续不自动重试，记录NR。
- [ ] Stage B真实服务/人工验收 WAITING_AUTHORIZATION；先核实费率/余量及共享Worker计量，不能擅自启动真实服务。
- [ ] 全部人工结束后补齐Stage B精确ID、重新只读Dry Run，等待单独删除确认。当前禁止清理。

本地提交后停止，不Push、不部署、不发邮件。详情见docs/corpus-stage-a-verification.md和corpus-stage-b-manual.md。下文为41f3ea9等历史里程碑状态。

## Current milestone — Corpus v1 + local integrated acceptance

- [x] 盘点Phase3–9、现有fixtures/测试及.acceptance脱敏结果；区分历史真实与Mock证据。
- [x] T01–T08统一合成场景、Zod契约、输入SHA、固定时钟/搜索快照；复用现有工具，无产品改动。
- [x] `test:corpus`及单例入口/JSON失败诊断；17检查通过，check181通过。
- [x] 生产E2E1项、启动smoke；真实本地5/10页PPTX结构/几何及15页逐页视觉通过。
- [x] 数据库写前隔离审查：发现工作台Scope缺口，不执行数据库测试，新增0条，保留所有历史数据。
- [x] 文档、六能力分层矩阵、扩展规则和条件费用草案（24模型/16Embedding/2Basic/2PPT，建议¥6上限，未授权）。
- [ ] DB Integration NOT_RUN：先证明已有测试库独立于Railway；不能仅靠Worker Scope，不擅自迁移/建库。
- [ ] 六能力同场景Live NOT_RUN / WAITING_AUTHORIZATION：先核实当前供应商/型号费率、向量免费条件和Storage余量，再单独批准。
- [ ] 同场景实际刷新/切会话/进程重启、私有下载及新Corpus文件PowerPoint/WPS原生打开。

本轮免费工作完成后创建本地commit并停止；不Push、不部署、不修改生产、不发邮件。Phase3上传500为观察项。后文为各阶段历史记录，不表示上述待验收项已通过。

Phases 1–6 are authorized; Phase 6 real sending requires separate explicit approval; Phase 5 begins with a bounded engineering review. Phase 3 accepted at 8edb365; Phase 4 accepted at ccc3c53; its prerequisite worker cleanup fix accepted at 7341aa9. Advance by feature milestones, not calendar dates. Later phases require separate instruction.

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
- [x] Confirmed, deduplicated email sending: Phase6 restricted real acceptance verified; future sends require separate authorization.
- [ ] Real web search.
- [ ] Chat-driven PPTX generation/download.
- [ ] Six-capability public acceptance, GitHub delivery and demo materials.

## Phase 5 — long-term memory (verified in targeted acceptance)

- [x] Review Phase 4 claim atomicity, lease fencing, process isolation and three historical failures.
- [x] Scope meeting/PDF expired-job cleanup to the same configuration boundary as claiming.
- [x] Real PostgreSQL isolation/concurrent-pool takeover regression: 2 passed (external providers stubbed); npm run check: 57 passed plus types/build.
- [x] User accepted prerequisite fix 7341aa9 and authorized memory implementation.
- [x] Implement provenance-preserving extraction, deduplication, durable memory, semantic recall and existing chat/UI integration.
- [x] Review/apply authorized additive migration 0005; obtain separate ¥3 budget (LLM <=36, Embedding <=28 after explicit expansion).
- [x] Offline 65 tests/types/build; real PostgreSQL memory suite 4 passed with explicitly stubbed providers.
- [x] True provider recall/restart/persisted audit: 3 passed; real PDF regression: 2 passed; real DB original-module regression: 10 passed. Failures retained in acceptance record.
- [x] Ordinary-chat real live 1 passed; final default development/production E2E 1 passed each.
- [x] All targeted acceptance gates passed; review scope and create local Phase 5 completion commit (identify via git log -1), then stop.

Evidence and limitations: docs/phase-5-verification.md. Phase 3 upload HTTP 500 remains OPEN.

## Phase 6 — Email Delivery (verified)

- [x] Read existing rules/spec/tasks/Phase5 and draft/worker/schema code; check official Resend API/SDK restrictions.
- [x] Add pinned official Resend SDK6.37.0, minimal adapter, backend sender/key/allowlist and disabled-by-default gate.
- [x] Implement separately confirmed send enqueue, immutable snapshot, global draft/version uniqueness, provider key and no blind retry after dispatch.
- [x] Add processing/accepted/delivered/failed/unknown states, tracking and read-only status lookup; UI preview/confirmation/history/manual-check guidance.
- [x] Review additive migration0006 and execute after separate DB-only authorization.
- [x] Offline73 tests/types/build and first real-DB/stub-provider4-test suite pass.
- [x] Expanded DB suite: 19 distinct tests pass across runs (initial 17/19, two connection-timeout cases passed on targeted rerun); browser+realDB+stub4 passed. Failures retained.
- [x] User configured Resend and authorized <=2 restricted real emails; corrected initial401/read preflight200.
- [x] Exactly2 actual sends, both database/provider delivered and user-confirmed receipt; version/duplicate/concurrency checks passed.
- [x] Final audit: two persisted delivered records, both user receipts, root sending disabled; complete checks/local commit then stop. No push/deployment/search/PPT.

Phase3 upload HTTP500 remains OPEN. Details: docs/phase-6-verification.md.

Phase6受限真实验收预检：用户已配置并授权最多2封、逐封确认；dotenv/发件人/单收件人限制校验通过，但Resend只读邮件查询HTTP401，已在发信前停止。实际发送0，根.env开关false，等待用户核实Key与读取权限。无真实MessageID/投递证据，不提交完成commit。

Phase6受限验收更新：重新只读预检HTTP200；第一封真实邮件POST一次HTTP200，Resend ID 01a1a5b7-4a15-7e6a-8d27-a9aab90e5dbf，数据库accepted/供应商sent。并发确认/提交及再次提交均同一记录，外部发送1次。隔离进程关闭、根.env开关false；等待用户收件确认后才发第二封新版本。未提交Phase6。

Phase6逐封验收：用户已确认第1封收件；第1封状态刷新delivered。第2封同一草稿v2已发送，旧确认/未确认发送均409；重复并发确认/提交仅1次外部发送。第2封MessageID 01a1a5b9-9c42-73c4-b777-b6278d27c646，数据库/供应商delivered。累计2/2封，发送关闭；等待第2封收件确认后最终提交。

Phase6 final: user confirmed second receipt. New-connection DB audit verifies v1/v2 both delivered with recorded Resend IDs, exactly2 outbound requests total, EMAIL_DELIVERY_ENABLED=false. All real acceptance gates passed; create local completion commit and stop. Earlier pending/failed entries above are historical records, not current blockers.

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

- [x] Implement provider/chat/UI/contracts and additive migration0007.
- [x] Approved real Tavily/model budget, safe config preflight and migration.
- [x] Required/auto/off, citation persistence, source accessibility and real regressions.
- [x] Offline and realDB/stub checks; retain failed attempts and fixes separately.
- [x] Final review/checks passed; create local completion commit (identify via git log -1), then stop before PPT.

## Phase 8 — AI PowerPoint Generation（已正式关闭）

保持 TypeScript 模块化单体、PptxGenJS4.0.1、现有任务 Worker/PostgreSQL/私有 Supabase Storage。聊天明确生成指令触发；支持中文16:9商务模板，总页数5–10（含封面/参考资料，默认7）。两阶段：有界来源检索与Zod结构化规划 → 确定性渲染；不执行模型代码，不缩小字体掩盖溢出。

来源复用 PDF、显式选择的会议及人工编辑待办、长期记忆；联网只接收独立公共搜索词，不拼接私有上下文。事实逐字匹配完整来源单位，分析/建议单独标注；来源不足不补造。官方来源限制按当前任务启用，Node.js只接受HTTPS精确nodejs.org，未识别的官方机构明确报错；普通任务不受此域名限制。下载前重新核验保存规划及私有文件SHA/结构。

任务、来源、规划及文件校验信息持久化；PPT_ACCESS_KEY（后端随机32–128字符）、PPT_SCOPE、PPT_MAX_TOKENS。PPT-only共享口令签发8h HttpOnly/SameSiteStrict Cookie，生产Secure；不是全工作区身份系统。UI沿用聊天面板，支持解锁、资料选择、状态/失败、跨会话历史和鉴权下载。现有其他模块边界不变，不能据此公开部署。

已批准的增量0008已应用。本次修复发布不新增迁移：context.artifactPublication使用Zod/TypeScript保存父文件、候选私有路径/SHA/大小/规划摘要、状态与时间。锁行登记pending后不可变上传、实际读回验证，再锁行核对父版本并事务切换路径/SHA/大小/规划及published状态。jsonb_set仅修改发布记录，不覆盖其他context；旧对象保留，失败可幂等恢复。仅本次B/D修复的内部工具，无新发布HTTP接口或通用版本系统。

最终A v1=5页、B v2=10页、C v1=5页、D v2=10页，四份均ready，本地/Storage/鉴权HTTP下载SHA一致，独立服务重启后再次下载一致。B7过度分析与D9非官方截断陈述整条删除；其他事实、负责人、日期和风险未改。A/C未重生成/未更新。B/D原对象与SHA保留。四份本地最终PPTX及证据位于忽略目录.acceptance/phase8-live；完整SHA、旧版本和命令记录见docs/phase-8-verification.md最终验收节。

测试：npm run check通过143项单元/API/兼容性测试、类型检查与构建；PPT真实数据库/外部替身10项通过，发布4项专项复跑通过；其余模块21项初跑19通过2项连接超时，邮件/会议7项单独复跑全通过。默认开发/生产E2E各1通过；真实只读鉴权/四文件下载/进程重启E2E1通过。来源持久化审计4任务/32份所用快照通过。四份实际PPTX独立包/布局校验0问题。模型/Embedding/搜索本轮0调用，邮件未发送，EMAIL_DELIVERY_ENABLED=false。

人工验收：用PowerPoint/WPS打开本地A/B/C/D（5/10/5/10），确认无修复提示；逐页检查中文字体、标题/表格换行、遮挡与备注引用。重点复核B7、D9已删除陈述及C/D人工负责人/日期。用户已确认PowerPoint/WPS原生打开通过，Phase8正式关闭；程序检查不替代这一用户确认。Phase3偶发上传HTTP500降为观察项；Phase9按用户新授权推进。

- [x] B/D安全发布及四份云端一致性、鉴权、重启验收。
- [x] 类型/构建/单元、数据库及适用E2E检查。
- [x] PowerPoint/WPS原生打开：用户已确认通过。
- [x] 用户最终审查通过，Phase8关闭；用户已批准Phase9准备。

## Phase 9 — Railway Demo 本地部署准备（已完成，未上线）

本轮新增Railway费用授权US$0；不创建Project/Service、不升级/绑卡、不推送/连接GitHub触发部署、不开放公网。取消独立Phase9A，不做生产级审计/复杂压测/历史故障专项。Phase8已由用户确认云端、自动化及PowerPoint/WPS原生打开通过并正式关闭。

实现：DEMO_ACCESS_KEY全站后端HMAC口令门禁（包含AI、上传、下载和其他业务API），HttpOnly/SameSiteStrict/生产Secure Cookie，登录与共享请求/写/上传次数限制，所有模型/搜索/向量实例共用尝试/分钟/并发及体积限制。旧PPT凭据不能绕过全站验证；全站会话可直接使用PPT。前端仅在登录后挂载业务工作台，不存储口令。生产/非回环地址缺口令或生产误开邮件会失败启动。

railway.json使用Railpack仓库根构建npm run build（依赖由Railpack Install阶段安装，.npmrc确保包含devDependencies），直接node dist/server/apps/api/src/server.js启动，单副本，Fastify托管SPA/API及现有模块Worker轮询；HOST生产默认0.0.0.0，PORT使用平台值。/api/health为存活200，/api/ready仅数据库可达才200，其他情况503；响应x-request-id、基础日志不含query/Cookie/Authorization。业务数据和文件继续在Supabase，无生产.acceptance/临时目录依赖，无新数据库/Volume/Redis/独立Worker服务或SQL迁移。

构建后npm run deploy:check做只读配置presence检查（不证明凭据有效）；npm run db:status只SELECT迁移hash/时间，无自动迁移。此前已验收0008；本轮不读取真实.env/数据库/Storage，不把历史结果冒充本轮云端验证。

验证：Node24.15.0/npm11.12.1，npm run check通过155项测试/类型检查/两个构建；开发和生产Chrome E2E各1通过；npm run test:production:smoke通过配置齐备/缺失、3种启动拒绝、数据库未配置/不可达、编译SPA、鉴权/429、日志脱敏及关闭。API未授权上传/下载/AI请求401，文件超限413；生产E2E深链/刷新/退出和移动端检查通过。无真实业务API、数据库/Storage调用、资源新增或费用。

当前无PATH可用Railway CLI，也无原账号关联配置；新增railway.json不是已创建项目。账号/是否有可复用Service未验证。若控制台确认无可复用，下一轮需另行授权一个Project/Node Service。Free方案是否足够当前Demo待实际验证；不能把免费credit当稳定长期承诺。后续账号、GitHub连接、变量、费用和验收步骤见[Railway部署说明](docs/railway-deployment.md)；本轮证据与分级问题见[Phase9准备验收](docs/phase-9-verification.md)。

Phase3上传HTTP500降为观察项，不阻塞；历史数据库连接超时只在实际复发时排查，不引入重试框架。EMAIL_DELIVERY_ENABLED=false，真实发送仍需单独授权。进程内调用限额重启会重置，不是账单硬上限；Cookie统一失效可轮换共享口令，不增加多用户/RBAC。

本地准备测试通过后本地提交，停止等待审查。真实Railway部署、实际Supabase连接/文件读写、平台Worker重启/六功能、公网网址与费用验证均未执行，需要下一轮明确授权。
- [x] 全站门禁、限额、生产配置、只读预检与部署说明。
- [x] check155测试、开发/生产E2E与本地编译启动检查。
- [x] Phase8用户原生软件确认已记录，正式关闭。
- [ ] 用户审查本地准备commit；另行授权Railway/GitHub/公网操作。
- [ ] 账号Free/网络/余额、实际资源/服务变量和云端六功能验收。

### Railway TLS 信任链修复（2026-11-05，待发布）

用户报告公网API500，容器pg.connect失败SELF_SIGNED_CERT_IN_CHAIN。已审查公开Supabase Root2021 CA并入库prod-ca-2021.crt；npm build新增复制到dist/server/certs/prod-ca-2021.crt。连接池仍rejectUnauthorized=true，沿用pg/Node默认主机名验证；URL所有query/hash仍被拒绝。没有改业务/SQL/数据/密钥。

后续获批部署时：DATABASE_SSL=true、DATABASE_CA_CERT=/app/dist/server/certs/prod-ca-2021.crt，DATABASE_URL不带sslmode/sslrootcert等query，保留真实DNS主机。先容器npm run db:tls严格TLS+SELECT1，通过后再/api/ready与鉴权业务API。不要关闭TLS校验。当前check157、生产smoke与生产E2E1通过，CA构建复制SHA一致；真实Railway握手/SELECT1/API尚未验证，未push/重新部署/修改变量。完整记录见docs/phase-9-verification.md末尾。

### 聊天搜索事实准确性修复（2026-11-05，离线验证）

官方要求按问题对应机构映射，不以nodejs.org作通用规则；聊天一次Basic搜索增加域名/查询日期提示，优先近期官方证据。结论必须逐字匹配来源并通过权威/时间检查，再显示来源与查询时间；旧证据仅供对照，缺失/冲突明确无法确认，不编造版本或日期。全部实际元数据与既有引用ID约束保留。PPT原搜索调用不传新增可选提示，行为保持不变；未改数据库、邮件或PPT。

新增7个固定Mock回归，npm run check通过164测试/类型/构建，生产smoke和生产E2E1通过。未付费搜索/模型调用，未访问真实数据库，暂不push/部署；记录和限制见docs/phase-9-verification.md末尾。
