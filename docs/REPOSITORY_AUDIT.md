# 仓库最终审计与清理记录

日期：2026-11-07；源码基线 2170fac；初始工作区干净，Git 跟踪 274 个文件。审计只新增文档和补文档索引，没有删除文件、修改业务/UI/测试/依赖/Schema，没有读取真实 .env、调用业务服务、访问云数据、部署或推送。

## 1. 仓库结构与分类 A：明确保留

| 路径/类别 | 当前作用与保留理由 |
| --- | --- |
| apps/api/src | Fastify 入口，chat/knowledge/meetings/memory/search/email/presentations 业务模块；config/db/demo/evidence 支撑真实路径 |
| apps/web/src | React 工作台、资料/会议/记忆/PPT 面板、附件多选、访问控制、Markdown 和基础交互组件；入口 main/App 有实际依赖 |
| shared | 八份前后端契约；没有 packages 目录，不能按 monorepo 模板凭空添加 |
| drizzle/*.sql、meta、drizzle.config.ts | 增量建库/演进与生成状态；保留全部，未执行任何迁移 |
| package.json / lock / tsconfig / Vite / Vitest / Playwright | 构建与各测试层入口，锁定依赖；没有为精简改版本 |
| railway.json / .railwayignore / .npmrc | 单服务构建、启动、健康检查、忽略本地证据、构建期 devDependencies；删除可能破坏部署 |
| prod-ca-2021.crt / scripts/copy-database-ca.mjs | 严格 TLS 的公开 CA 与构建复制，不是私钥；不能因扩展名 crt 删除 |
| demo/ | 当前面试 Demo Kit、操作指南、验收表与四份合成材料；与 tests 原件有意重复，提供独立下载用途 |
| tests/unit、integration、*-live、e2e、support、fixtures、corpus | 不同证据层；替身明确标注，冻结失败 JSON 有回归价值，不能按 STUB/CORPUS 名称删除 |
| scripts/ | 验收/夹具生成/隔离/遥测/脱敏/迁移预检；非 npm script 不等于无调用者，历史操作入口也有复现价值 |
| README / SPEC / TASKS / AGENTS | 项目入口、规范、状态与执行边界；AGENTS 有阶段性旧文字，列 C 而不擅自改授权规则 |
| docs/assignment.txt | 原始任务文件，本轮不修改 |
| docs 历史验收、development-history | 包含失败、真实服务边界、修复定位与授权证据，不能用新总结覆盖原结论 |

依赖核对：React/react-dom 用于前端；Fastify/static 用于 API 和生产静态站点；pg/Drizzle/Zod 用于持久化和契约；pdfjs/PptxGenJS/JSZip/Resend 对应解析、生成、校验和邮件；dotenv 用于运行配置。开发依赖对应 TS/Vite/Vitest/Playwright/tsx/Drizzle/concurrently 与类型。未确认可安全移除的依赖。`ContextProvider` 等未见调用的接口也不因少量死声明触发本轮代码清理。

## 2. 分类 B：确认无用且已安全删除

**无。实际删除 0 个文件。** 没有文件同时满足“无引用、无操作用途、无复现/验收价值、删除风险低”的条件。不能把减少行数当交付指标。

特别核实：`search/service.ts:answerWithSearch` 已不在普通聊天主路径，但 `tests/unit/corpus-v1.test.ts`、search-current/search-v13/v131 等直接调用，且 `synthesis.ts`、`format.ts` 是其依赖。因此旧审核链和日志不能独立安全删除。Demo 的重复 PDF/TXT 通过 manifest 绑定原件，删除会损害独立演示。

本地可见 node_modules、dist、.npm-cache、test-results、.acceptance、certs 和 .env 均不在跟踪清单；忽略规则已有覆盖。没有进入 .acceptance/certs/.env 清理或检查内容，也没有删除本轮生成的失败 trace。它们不属于 GitHub 仓库冗余。

## 3. 分类 C：需要人工决定

| 具体路径 | 原作用 / 现在的问题 | 引用、删除影响与建议 |
| --- | --- | --- |
| docs/phase-1-verification.md 至 phase-9-verification.md、phase-2/3-setup.md | 分阶段实现与服务接入记录，早期“待发布/不支持”容易误读为当前状态 | development-history/SPEC/TASKS 等依赖历史说明；建议后续统一历史导航，不删除原证据 |
| docs/corpus-stage-b-manual.md | 历史人工验收交接，含机器绝对路径和 Run ID | 是 Stage A→B 的证据入口；可人工决定将路径改为相对示例，但须保留历史定位意义 |
| docs/phase-2-setup.md | 服务配置指导，使用本地绝对 .env 路径 | 不是凭据；可后续改为“仓库根目录”，不应因此删除配置说明 |
| docs/mvp-v1.*-verification.md、mvp-final-closeout.md、stage-b-round1-fixes.md | 多轮真实失败/修复/复测，文字重复但证据不同 | v131/v132 fixtures 与实际修复呼应；保留，未来可建历史索引，不能合并丢失 FAIL |
| docs/ux-backlog.md | 历史 UI 改进待办 | 需人工对照最终 UI 决定关闭/归档；本轮不重设计或修改 UI |
| scripts/phase7-preflight.ts、phase8-*、repair-phase8.ts、stage-b-round1-audit.ts | 阶段性受控验收/修复脚本 | 有环境/授权和历史数据前提；未运行，保留复现用途，未来逐个维护者确认后才删 |
| scripts/migrate-demo-management.ts、migrate-meeting-archive.ts、migrate-ppt-page-budget.ts | 审查后的定向迁移操作入口 | SQL 已有迁移并不证明这些操作脚本无用；删除前核对部署手册，不执行验证 |
| apps/api/src/search/{service,synthesis,format}.ts 的旧审核路径与相关测试 | 当前公开聊天已经简化，旧路径增加阅读成本 | 测试仍引用；若要移至历史回放模块，需独立批准代码/测试变更，本轮不改 |
| AGENTS.md 的 Phase 4 授权段 | 历史阶段指令与已完成项目状态并存 | 是执行规则而非无用 README，维护者应明确更新，审计不能自行删除限制 |

这些是维护/呈现建议，不是业务缺陷。没有移动文档导致链接失效，也没有修改 Git 历史。

## 4. 缺陷、风险与证据等级

### P2：开发模式 E2E 的健康检查用例稳定失败，生产模式通过

证据：`tests/e2e/workspace.spec.ts:3` 的测试 route 对 `/api/demo-session` 第二次及后续 GET 强制返回 503；`apps/web/src/main.tsx` 使用 StrictMode；`DemoAccess.tsx` 在 effect 中请求会话，清理时 abort。开发 StrictMode 会重复 effect，第一次被取消而第二次可能被替身拒绝，App 不挂载，因而没有 `/api/health`。这是与稳定超时一致的代码原因，具体网络顺序仍须 trace 确认，不能据此宣称公网业务坏了。

验证：Chrome 全开发套件 6/7；定向 `npm run test:e2e -- -- --grep 'workspace displays health'` 再次 30 秒超时；Chrome 生产 7/7。建议后续只修测试注入：先允许父级探测完成，再对真正冗余子请求注入失败，保留原意图。当前用户冻结业务逻辑，本轮未修改测试或关闭 StrictMode，失败明确保留。文档提交不意味着全套验收通过。

### P2：历史安全处置尚无本轮确认

`docs/mvp-final-closeout.md` 记录过历史测试 Cookie 与生产键是否共用未知、轮换待确认。现有 HMAC 同键可跨进程验证，所以若当时共用生产键且 Cookie 未过期，确有访问风险；当前状态不能从代码推断。建议维护者确认是否曾复用并完成轮换记录；本轮不读取/修改密钥、不测试旧 Cookie。

### 已知限制与观察项（不伪装新发现或已修复）

- Phase3 偶发上传 500 仍 OPEN；本轮没有根因证据，不借 TLS/PPT 修复关闭它。
- 搜索结果新鲜度、自然综合语义准确性仍受供应商/模型影响。旧 Corpus 通过不证明当前普通搜索逐 Claim 审核。
- 单工作区无用户资源隔离；软删除不是擦除；进程限额不是账户预算硬上限。
- README Live Demo 仍为待维护者补充地址，没有可验证部署 URL；用户确认上线与仓库发布元数据缺失同时成立。本轮未编造 URL 或访问云端。
- 历史部署启动错误的具体缺失变量/命令，本轮未见充分云端证据；最新启动诊断补丁不应被写成已验证完整根因。

## 5. 公开仓库敏感信息与链接检查

仅扫描 Git 跟踪的文本源文件/文档/配置，不扫描真实 .env、凭据目录、忽略的原始验收文件或 Git 历史对象。使用文件名/类别输出，不回显可疑值。未发现私钥 PEM 块或长 cp_demo Cookie 常量；跟踪清单无真实 .env、dist、node_modules、.acceptance、test-results、certs。连接 URI 模式命中 phase-2-setup（USER/ENCODED_PASSWORD/HOST 占位符）、production-smoke、database-config/startup-diagnostic（合成不可用地址）。公开 CA 构建测试通过。

绝对路径命中 SPEC/TASKS、phase-2-setup、corpus-stage-b-manual、development-history、phase-9、railway-deployment；含历史本机路径和 `/app` 部署示例，不是已确认凭据泄露，但可影响专业呈现，归 C。无真实 secret 值的完备证明：模式扫描不能发现所有随机令牌，也未审计已发布 Git 历史/远程日志。未执行历史重写。

应用目录 25 处 console 调用主要为 CLI 状态、启动错误、LLM 形状/截断和旧搜索阶段诊断；不等于 25 处无用调试。未发现必须删除的正文转储；保留现有诊断。服务 logger 对 Cookie/authorization 脱敏，测试启动输出也有 redact-output；这不保证任何未来日志天然安全。

README 与 demo/*.md 的本地 Markdown 链接目标均存在；四个 demo/files 文件 SHA、字节数及与 manifest source 原件字节比较全部通过。外部网址本轮不做网络可达性或内容时效背书。三份新文档使用仓库相对链接，代码定位用真实路径与函数名；不新建根目录零散总结。

## 6. 实际验证与清理前后结果

环境：Node v24.15.0、npm 11.12.1。所有命令在仓库根目录，默认隔离外部服务；没有运行 DB integration/live、真实邮件、迁移或线上测试。

| 验证 | 结果与证据边界 |
| --- | --- |
| 修改前 npm run check | PASS：33 文件、265 测试、类型检查、API/Web 构建 |
| npm run test:corpus | PASS：17/17，旧搜索协议及外部 STUB 的固定回归，不是新 Live 验收 |
| 默认浏览器开发与生产 E2E | 各 7 项在启动浏览器时失败，Chromium headless shell 缺失，未进入业务 |
| PLAYWRIGHT_CHANNEL=chrome 开发 E2E | 6 PASS / 1 FAIL，health 用例 30 秒等待超时；定向复跑仍 FAIL |
| PLAYWRIGHT_CHANNEL=chrome 生产 E2E | 7/7 PASS；真实编译服务/浏览器边界，业务 UI 多为 fixtures |
| npm run test:production:smoke | PASS：2 类配置存在检查、8 种启动拒绝、邮件 opt-in 启动、严格 CA 启动、鉴权/限流/脱敏/ready503，外部业务 0 |
| 文件/链接/差异 | Demo 4/4 哈希与原件一致；README/Demo 本地链接无缺失；git diff --check PASS |

本轮没有删除或业务代码变更，所以不声称“清理提升了测试表现”。文档完成后再次运行 check：33 文件、265 测试、类型及双构建 PASS；README/SPEC/TASKS/Demo 与三份新文档本地链接复查无缺失。真实 PG、云端六能力、原生 PPT 打开均 NOT_RUN；当前凭据有效性、邮件开关/白名单和部署提交一致性未核实，无新增凭据请求。

## 7. 交付文件与停止点

新增本文件、`ARCHITECTURE_REVIEW.md`、`INTERVIEW_GUIDE.md`；修改 README/SPEC/TASKS 只补入口与审计状态。没有删除、移动、改名。按照用户要求创建本地文档提交，明确保留开发 E2E 失败，不把提交当无条件通过的发布许可；不 push、不部署。人工决策集中在分类 C、生产密钥历史处置与开发测试替身修复。
