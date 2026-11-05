# ContextPilot

面向南京信人智能的 AI 外脑实操 Demo。原始需求见 [docs/assignment.txt](docs/assignment.txt)；阶段规范见 [SPEC.md](SPEC.md)，开发状态见 [TASKS.md](TASKS.md)。

**Phase 6 真实邮件发送验收通过。** 获授权的两封测试邮件均已由 Resend 报告 delivered，并由用户逐封确认收到；同一草稿两版本分别唯一发送，重复/并发提交没有增加外部发送次数。发送开关已恢复 false，详见 [Phase 6 验收记录](docs/phase-6-verification.md)。

**Phase 5 已实现跨会话长期记忆。** 聊天与会议事实持久化，支持新会话召回、原文来源和提取状态查看；真实服务专项结果见 [Phase 5 验收记录](docs/phase-5-verification.md)。

**Phase 4 会议分析已通过真实服务验收。** UTF-8 TXT 上传至 Supabase 私有 Storage，自动分析会议、生成带行号证据的风险与待办，支持人工编辑、重复上传去重和重新分析。邮件只准备草稿和版本确认，全部保持未发送。真实业务用例分次通过，模型不合规输出的失败记录也保留，详见 [Phase 4 验收记录](docs/phase-4-verification.md)。

Phase 3 PDF RAG 与原有聊天真实回归通过；接入说明见 [Phase 3 配置](docs/phase-3-setup.md)。既有未复现上传 HTTP 500 作为观察项；RAG 目前主要支持可核实摘录式回答，带证据综合归纳仍需评估。长期记忆已实现，真实验收记录见下方；邮件发送实现与验收边界见下方 Phase 6；联网搜索真实验收通过；Phase 8 已由用户确认云端、自动化及 PowerPoint/WPS 原生打开全部验收通过并正式关闭。未部署、未推送 GitHub；公开访问前必须完成工作区保护。

## 环境与启动

要求 Node.js 24.x、npm 11.x、Git；无需全局 CLI。本项目依赖锁定于 package-lock.json。

在仓库根目录执行：

```sh
npm ci
npm run dev
```

浏览器打开 http://127.0.0.1:5173 。API 为 http://127.0.0.1:3001/api/health 。根脚本同时运行前后端，Ctrl+C 停止两者。也可分别运行 `npm run dev:api`、`npm run dev:web`。

无需创建 .env 就能启动 Phase 1。默认数据库未配置，页面应明确显示“数据库未配置”。`GET /api/health` 是存活检查，不代表任何外部服务可用；`GET /api/ready` 在数据库未配置或不可达时返回 503。

## 检查与构建

```sh
npm run typecheck
npm test
npm run build
# 或一次执行以上检查
npm run check
```

浏览器测试（首次需安装项目使用的 Chromium；不安装全局工具）：

```sh
npx playwright install chromium
npm run test:e2e
# 构建后检查生产静态服务及同源 API
npm run build
npm run test:e2e:production
```

Playwright 默认下载至用户缓存。若希望浏览器也保存在项目依赖下，PowerShell 中先执行 `$env:PLAYWRIGHT_BROWSERS_PATH='0'`，然后在同一终端执行上述安装和测试命令。测试自动启动真实 Vite/Fastify 服务，测试端口 5273 和 3101 需空闲；不干扰开发端口 5173/3001。浏览器安装不应写入版本库。

已有 Chrome 时，可设置 `$env:PLAYWRIGHT_CHANNEL='chrome'` 后直接运行 E2E，无需下载 Chromium。本轮使用此方式验证。

生产构建本地验证：先 `npm run build`，然后 PowerShell：

```powershell
$env:NODE_ENV='production'
npm start
```

访问 http://127.0.0.1:3001 。生产模式由同一个 Fastify 服务提供 `dist/web` 和 `/api/*`；根目录启动，不要在 dist 子目录运行。Unix 对应 `NODE_ENV=production npm start`。结束验证后可移除当前终端变量：`Remove-Item Env:NODE_ENV`。

## 目录

```text
apps/web/             React 页面、CSS、Vite 配置
apps/api/src/         Fastify 服务、环境校验、数据库工具
shared/               前后端共享 Zod 契约
drizzle/              版本化 SQL 迁移及元数据
tests/unit/           配置、真实 API 与库兼容性测试
tests/e2e/            浏览器到真实后端测试
docs/assignment.txt   不可修改的原始要求
```

## 环境变量

`.env.example` 只有示例。经授权配置实际凭据后，可在根目录创建被 Git 忽略的 `.env`。后端由 dotenv 读取；不要提交真实文件，也不要使用 `VITE_*` 保存密钥。

| 变量 | 默认值 | 用途 |
|---|---|---|
| NODE_ENV | development | development/test/production；生产时启用静态页面 |
| HOST | 127.0.0.1 | 本地绑定；容器部署时需设置 0.0.0.0 |
| PORT | 3001 | API 端口，1–65535 |
| LOG_LEVEL | info | fatal/error/warn/info/debug/trace/silent |
| DATABASE_URL | 未设置 | postgresql:// 或 postgres:// 连接串；空值表示未配置 |
| DATABASE_SSL | true | 开启 TLS 并验证证书；只允许本机 PostgreSQL 显式关闭 |
| DATABASE_CA_CERT | 未设置 | 可选 Supabase CA 公共证书本地路径；不会关闭证书校验 |
| LLM_BASE_URL | 未设置 | 后端 OpenAI-compatible API 前缀，按供应商要求包含 /v1 |
| LLM_MODEL | 未设置 | 模型名称 |
| LLM_API_KEY | 未设置 | 后端专用 API Key |
| LLM_TIMEOUT_MS | 45000 | 模型超时，最大 60000ms |
| LLM_MAX_TOKENS | 1024 | 单次生成 token 上限 |
| MEETING_MAX_TOKENS | 8192 | 会议结构化输出独立上限（1024–8192），不改变普通聊天 |
| MEETING_TIMEOUT_MS | 90000 | 会议模型请求超时，最大 120000ms；不改变普通聊天 |
| API_PROXY_TARGET | http://127.0.0.1:3001 | 仅开发时 Vite 代理目标，修改后需重启 |

环境变量无效时启动失败；错误不打印凭据值。数据库地址通过格式校验不代表连接成功。DATABASE_URL 禁止查询参数和 fragment；SSL 统一由 DATABASE_SSL/DATABASE_CA_CERT 配置，防止 URI 覆盖证书校验。

## 数据库与迁移

Phase 2 增加 conversations/messages 表；版本化迁移启用 RLS，没有向 Supabase Data API 开放访问策略。后台连接需要拥有相应读写权限，迁移连接需要支持 pgvector 和创建扩展权限。迁移只新增对象，不清空或删除数据。

```sh
npm run db:check
npm run db:migrate
# 后续获批新增 schema 后生成并审查版本化迁移
npm run db:generate
```

未配置 DATABASE_URL 时，前两个命令明确失败并返回非零退出码，不伪造成功。`db:migrate` 会修改目标数据库，只能对获授权的数据库执行；不在服务启动时自动迁移。`db:generate` 离线生成迁移，不需要数据库凭据。

本次已通过真实连接、客户端 TLS/CA、迁移执行、服务端 vector 运算及真实模型验收。Drizzle SQL 和模型 Mock 测试只属于离线检查，不能替代真实验收；两层结果分别记录。Pooler 上游未报告 SSL，需在公开部署前核实 Supabase SSL enforcement 设置，详见 Phase 2 验收。

## 公网部署方案（尚未执行）

1. 经确认选择支持 Node 24 常驻进程、HTTPS、环境注入及日志的容器托管服务；从南京实际演示网络测试访问。
2. 构建阶段 `npm ci`、`npm run check`；运行阶段根目录 `npm start`，配置 NODE_ENV=production、HOST=0.0.0.0、平台要求的 PORT。
3. 使用持久化 PostgreSQL + pgvector 和私有对象存储；后续全部用户文件、记忆、向量、任务都不得依赖容器临时磁盘。
4. 对目标数据库单独执行已审查迁移；配置连接池、TLS、备份和区域。健康探针用 `/api/health`；数据库部署就绪检查用 `/api/ready`。
5. 公开业务应用前必须完成演示工作区保护、文件鉴权和调用限额；Phase 1 不能当作已完成的公网 Demo。
6. 后续经确认接入 LLM、embedding、搜索、邮件。验证地域限制、额度、中文效果、超时和发件域名。邮件必须确认、去重并保存发送记录。
7. 最终再完成 GitHub 推送、演示脚本、六项功能真实验收材料。本轮不创建资源、不部署或远程推送；模型验收按用户确认的计费预算执行。

## 会议 TXT 使用与验收

复用已配置的 DATABASE_URL、LLM_*、SUPABASE_URL、SUPABASE_STORAGE_KEY、SUPABASE_STORAGE_BUCKET（具体 Storage 名称以 .env.example 为准），无需新凭据。Bucket 必须 Private；服务端每次访问检查隐私设置。后端限制 .txt + text/plain、严格 UTF-8、非空且最多 1 MiB / 64000 UTF-16 字符 / 4000 行 / 每行 2000 字符；Bucket 的 50 MB/Any 设置不会放宽应用限制。PDF 仍受原有校验。

1. 审查并执行 `npm run db:migrate`（本阶段 0003/0004 为新增会议领域表的迁移，已在验收库执行）。
2. `npm run dev`，在现有页面上传 `tests/fixtures/meeting-risk.txt`，等待完成，展开风险证据查看行号。
3. 修改待办负责人、日期和状态后保存；草稿收件人须自行输入。先保存草稿，再确认当前版本，确认只记录快照，绝不发送。
4. 相同原始字节重复上传返回原会议，不再调用模型；重新分析保留人工编辑和旧版本。旧草稿需复核保存后才能再次确认。

长文按约 8000 字符、2 行重叠提取，超过一段时额外合并。解析、结构或证据校验失败显示 failed，不发布半成品；无文本、超限或无效编码直接拒绝。模型遗漏和风险语义仍需人工复核，不能仅凭引用存在判断分析正确。

```powershell
# 离线/Mock 测试、类型检查、构建
npm run check
# 真实 PostgreSQL，但 Storage/LLM 是明确的测试替身
npm run test:integration -- tests/integration/meetings.test.ts
# 以下会产生真实模型调用，必须先获预算授权；默认不自动重试
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:e2e:meetings
```

可复现样本：meeting-risk.txt、meeting-safe.txt、meeting-unknown-injection.txt；长文由 scripts/meeting-fixtures.ts 生成。验收测试保留自己的云端记录供审查，不删除用户数据。实时测试并非默认离线检查的一部分；费用统计范围和失败历史见阶段验收记录。

## Phase 5 前置工程检查

前置修复已接受（7341aa9），主体实现与验收继续记录在下方。已修复会议/PDF worker 过期清理跨 Storage/Embedding 配置范围修改状态的问题，并通过真实 PostgreSQL 隔离/租约竞争测试（外部服务全部替身）。同配置开发与真实验收进程仍共享队列：真实付费验收前须停止其他 worker，仅保留一个带遥测实例，端口隔离不等于任务隔离。默认 E2E 不连接业务数据库。详见 [Phase 5 前置记录](docs/phase-5-verification.md)。

## Phase 5 长期记忆

现有聊天会自动为用户消息排队提取人物、时间、地点、主题、事件、决策；会议成功后从已验证分析提取事实。助手推测与风险影响不作为事实写入。先执行已审查的增量迁移 `npm run db:migrate`，再启动服务。沿用后端 LLM 和可选 BGE-M3/pgvector 配置，无新增依赖。服务端 `MEMORY_SCOPE` 默认为 `demo`，测试使用独立值；前端不能设置。当前仍是本地共享单工作区，未实现多用户鉴权，不可公开部署。

在“长期记忆”入口查看事实、原文与任务状态；queued/processing 尚不能召回，failed 不影响原始记录，ready 才已完成提取。新建会话后普通聊天自动检索已保存事实，回答展开来源核对。相对日期和缺失年份保留原文，记录时间不代表发生时间；同名及冲突事实不擅自合并覆盖。引用式回答侧重可靠出处，尚非自由综合归纳。

精确重复事实在同一来源上下文内去重并保留多个出处；语义相近改写不会被自动合并。现有历史资料不会未经请求批量付费提取；旧会议可通过现有重新分析触发。原始证据并不证明陈述本身真实。最新100条事实/任务可在界面查看。

```powershell
npm run check
$env:RUN_LIVE_TESTS='1'
# 真实数据库，模型/Embedding/Storage 为替身
npm run test:integration -- tests/integration/memory.test.ts
# 以下必须先获得费用授权；停止其他开发 API worker
$env:ACCEPTANCE_TRACKING='1'
$env:ACCEPTANCE_PHASE='5'
$env:MEMORY_SCOPE='phase5-acceptance-final'
$env:PLAYWRIGHT_CHANNEL='chrome'
node scripts/e2e.mjs --live --memory-live -- --grep 'REAL chat/meeting'
# 单独启动第二个服务进程检查重启持久化，不新增模型请求
node scripts/e2e.mjs --live --memory-live -- --grep 'RESTART retains'
```

验收账本在被忽略的 `.acceptance`，不含凭据；它是请求前保守预留，不是账户账单。Phase 5 预算需单独授权，不沿用 Phase 4 授权。详情见 [Phase 5 验收记录](docs/phase-5-verification.md)。

## Phase 6 邮件配置与权限边界

复用现有会议草稿：编辑保存 → 确认当前版本（不发送）→ 展开冻结版本预览 → 勾选确认 → 单独点击“确认发送邮件”。服务端同时校验白名单、确认快照、草稿版本及会议分析状态。AI、记忆、PDF/TXT 无发送权限。

邮件由轻量适配器调用固定版本 Resend 官方SDK 6.37.0（Node >=20，已在 Node24 验证）。`email_deliveries` 保存冻结内容、供应商ID、错误码和追踪/时间，唯一约束永久阻止同一草稿版本重复入队；稳定 Idempotency Key 提供供应商侧24小时窗口内的额外保护。进入 processing 后不重新领取，超时/中断记 unknown 并阻止编辑绕过重发。HTTP接受不是送达；用户显式点击状态核查，通过只读Resend接口更新 delivered/failed。delivered 只表明供应商报告对端邮件服务器接受，不保证收件箱位置。

在仓库根 `.env` 自行配置，勿把密钥发到聊天或前端：

| 变量 | 配置 |
|---|---|
| EMAIL_DELIVERY_ENABLED | 默认false；仅在真实发送明确获批后改true |
| RESEND_API_KEY | 后端Resend密钥；发送、邮件状态读取，verified模式还需域名读取权限 |
| EMAIL_FROM | 纯邮箱地址；测试可用onboarding@resend.dev，自有域名模式必须匹配已验证域名 |
| EMAIL_ALLOWED_RECIPIENTS | 精确邮箱白名单，以英文逗号分隔，最多10个；不支持域名通配符 |
| EMAIL_MODE | test 或 verified |
| EMAIL_TEST_ACCOUNT_ADDRESS | test模式必填，为Resend账号注册邮箱，白名单只能含此邮箱 |
| RESEND_DOMAIN_ID | verified模式必填，对应已验证且允许sending的域名ID |
| EMAIL_SCOPE | 默认demo，隔离邮件worker与历史读取；切换不会绕过草稿版本的永久去重 |

自有发件域名需要在Resend Domains添加并按控制台设置DNS后验证。`resend.dev`受限测试只能发到账号自己的邮箱；不能假设任意白名单地址都被Resend允许。当前账号已通过邮件读取及两封受限onboarding真实发信验收；自有域名、其他收件人及额外额度/生产审批不在本次验证范围。发往Resend模拟地址只验证供应商模拟事件，不是用户收件箱真实送达；本实现test模式刻意仅允许账号自身邮箱。

控制台操作：确认账号注册邮箱、剩余额度和发送限制；为本Demo创建合适权限的后端密钥；选择受限测试或已验证的自有发件域名。不要购买新域名或升级付费资源。先保持发送开关false，完成配置后告知配置完成并明确批准发送的封数与收件人范围。计划最多2封真实测试，均仅发往用户控制且在白名单内的地址；验证同版本重复提交只发1封、修改后重新确认新版本、供应商状态与收件人实际核对。该计划已获批并完成，两封均实际收件；后续任何新发信须另获授权，当前发送开关保持false。

```powershell
npm run check
# 真实数据库，邮件供应商/其他业务服务均为替身；无真实发信
$env:RUN_LIVE_TESTS='1'
npm run test:integration
$env:PLAYWRIGHT_CHANNEL='chrome'
node scripts/e2e.mjs --email-stub
```

`--email-stub` 使用单独测试入口、真实PostgreSQL与替身EmailProvider，不能证明Resend已配置或真实投递。普通E2E和聊天/RAG等live启动脚本强制禁用邮件，不会因测试启动领取真实发送任务。没有mock供应商的环境变量开关或生产HTTP测试路由。详情见 [Phase 6 验收记录](docs/phase-6-verification.md)。

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
