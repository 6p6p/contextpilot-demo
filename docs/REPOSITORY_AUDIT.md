# Repository Cleanup — 实际清理记录

2026-11-07；清理基线 ac43dac。上一轮为只读审计与总结，本轮获得明确删除及小范围测试修复授权。未改业务运行行为、依赖、数据库/迁移、Railway 配置、UI 或云端资源；未读取真实 .env、发送邮件、部署或 Push。

## 1. Git 跟踪清单

计数来自 git ls-files，不计算 node_modules、dist、.acceptance、缓存和浏览器产物。tests 数量包含 fixture/README/支持代码，不能当作测试用例数。

| 类别 | 清理前 | 清理后 |
| --- | ---: | ---: |
| 全仓 Git 文件 | 277 | 269 |
| docs 文件 | 32（31 Markdown + assignment.txt） | 24（23 Markdown + assignment.txt） |
| tests 文件 | 79（61 TS 测试/支持文件） | 79 |
| scripts 文件 | 25 | 25 |

根目录保留 README、SPEC、当前 TASKS、AGENTS、package/lock、TypeScript/Vite/Vitest/Playwright、Railway、公开 CA 与忽略配置。不存在 packages/；apps/api 和 apps/web 分工不变，shared 为共享契约。无跟踪的构建/缓存/临时截图可删除。.gitignore 已覆盖 .env、certs、.acceptance、node_modules、dist、test-results、日志等，本轮不修改。

## 2. 实际删除：8 份文档

每份均检查了全仓 Git 跟踪文本中的文件名引用；运行代码、package scripts 与部署配置不加载这些文档。下表记录删除前引用关系，已删除文件之间的引用随文件消失，保留文件的链接已修复。旧全文可用 git show ac43dac:<路径> 查看，不新建 archive。

| 删除路径 | 原作用 | 删除理由、替代与引用修复 |
| --- | --- | --- |
| docs/phase-1-verification.md | 初始环境、依赖兼容与脚手架验收 | Node/依赖由 package/lock 与 compatibility 测试直接证明；当前架构/本轮 check 覆盖交付说明。仅 TASKS/旧审计提及；TASKS 改为当前清单。旧 14 项计数与未实现功能列表不再占工作树 |
| docs/phase-2-setup.md | 聊天/数据库接入说明 | 配置项由 .env.example 与 railway-deployment 提供，当前链路由架构复盘覆盖；独有连接/编码/双段 TLS/测试授权边界合入 ARCHITECTURE_REVIEW 第8节。旧审计及 phase-2-verification 的历史关联不再需要独立 setup |
| docs/phase-2-verification.md | 早期真实聊天/PG 验收 | 当前聊天实现、后续 Phase5 回归与架构复盘覆盖功能/故障机制；独有 pooler TLS 未核实事项保留第8节，不把历史计数当当前结果。删除前由 TASKS/phase-2-setup 引用，已消除 |
| docs/phase-3-setup.md | 早期 PDF 配置、处理流程与夹具说明 | .env.example、架构 PDF 节、Demo Kit 和保留的 phase-3-verification 覆盖；夹具重生成与授权说明合入第8节。仅 development-history 链接，随该重复文件删除 |
| docs/development-history.md | 原 README 全量阶段流水账 | 与 SPEC、Phase 验收和最终架构/面试总结重复，包含过时“不支持/待部署”描述；README/SPEC 改指源码总结，不再声称其是完整历史档案。历史全文由 Git 保留 |
| docs/final-ui-verification.md | 完成后的视觉/交互改造报告 | 交互契约已在 SPEC，实际断点/IME/滚动/附件回归在 e2e；未全面验证的实体手机/系统IME/跨浏览器保留 TASKS/架构第8节。SPEC/stage-b 引导改当前契约或任务；development-history/ux-backlog 随删除消除 |
| docs/pdf-multiselect-verification.md | PDF 下拉框局部 UI 交付报告 | SPEC 保留完整选择语义，ui-final 保留45项列表、键盘与精确 payload 回归；不重复保留旧测试计数/截图位置。SPEC 链接改当前源码复盘，TASKS 精简，development-history 删除 |
| docs/ux-backlog.md | 多轮覆盖更新的 UI 历史待办 | 已完成状态由 SPEC/实际测试覆盖，未完成的 GFM 扩展、手机/跨浏览器、归档恢复/物理清理在 TASKS 保留。SPEC 与 stage-b-round1-fixes 引用修复，无悬空链接 |

删除不影响构建、测试、部署、Demo 材料或数据库复现；没有删除原始验收输入、失败 JSON、Run manifest 脚本或迁移。并非认定这些历史从未有用，而是当前阅读入口已有替代，旧逐轮细节留 Git 即可。

## 3. 删除的代码与保留的旧路径

- 删除 apps/api/src/chat/context.ts 中 ContextSource、ContextProvider 两个未使用接口（及空行）。全仓源码/测试/脚本搜索只有定义，没有 import、类型引用或动态使用；当前知识/记忆通过实际 service 接口接入。这是类型声明清理，没有运行时输出变化。
- TASKS 从 318 行历史流水账精简成当前能力、已完成项和未决风险；独有安全处置、上传500、人工设备检查、产品边界未删除。
- 无 npm 依赖删除：每个运行依赖分别有 React/Fastify/PG/Zod/PDF/PPT/Resend/dotenv 使用；开发依赖对应构建、类型、测试、夹具/迁移开发命令。没有确认无用的 React 组件、API 或配置项。

搜索审核调用图：

```text
当前公共聊天：chat/service → search/public:answerPublicSearch
                        → service:publicQuery/createSearchProvider
                        → evidence:searchIntent/officialSource
旧回放路径：Corpus / search*.test / v131-regressions / mvp-quality 等
          → service:answerWithSearch → synthesis:synthesizeSearch
                                  → format:normalizeSynthesis / synthesisContract
                                  → evidence:conflictingLts/ltsStates/currentConclusion 等
PPT：presentations/evidence 独立引文规则，仍被 plan/coverage 使用
RAG：knowledge/retrieval 独立 verifyEvidence，不走旧搜索审核
```

Claim/Quote Schema、Prompt、转换和旧版本冲突判定不再参与普通搜索，但 Corpus 和多个保留回归仍直接调用。用户要求保留 Corpus 且不损失覆盖，因此本轮不通过删除测试制造“无引用”，也不大规模迁移模块。其去留仍需决定是继续维护历史回放，还是另批将业务不变量迁移到当前路径后退休旧协议。不同模块同名 quoteOptions 处理的来源类型不同，不能当作重复函数直接合并。

## 4. 全部剩余文档与脚本的决定

| 保留路径/组 | 独立价值与原因 |
| --- | --- |
| ARCHITECTURE_REVIEW / INTERVIEW_GUIDE / 本文件 | 当前源码解释、面试问答、实际清理记录，各有用途 |
| assignment.txt | 原始任务，明确禁止修改 |
| demo-kit-verification / email-release-check | Demo 材料校验与现行邮件 opt-in/真实收件操作边界，不能用架构概述替代 |
| phase-3/4/5/6/7/8/9-verification | 分别保存 PDF上传500、会议证据、记忆双池竞争、实际收件、真实搜索调用、云文件一致性、TLS/部署诊断的原始证据；包含不能被最终概述完整替代的失败/Run/分层结果 |
| mvp-v1.1 / v1.2 / v1.3 / v1.3.1 / v1.3.2-verification | 管理迁移、语义分类、真实失败、冻结fixture、PPT必需正文覆盖与后续受限Live，版本之间不是重复通过记录 |
| mvp-final-closeout / stage-b-round1-fixes | 搜索自然综合取舍、Cookie处置及截断诊断的失败边界；stage-b 原UX引用改为当前 TASKS |
| corpus-v1-acceptance / corpus-stage-a-verification / corpus-stage-b-manual | Golden 证据层、共享库隔离/受控Run与手动验收步骤不同；保留，不能把旧 WAITING 当当前功能状态 |
| railway-deployment | 实际运行/变量/CA/构建说明，虽含历史准备语句已有历史标记；本轮不伪造云端复验结果 |

25 个 scripts 均保留：package.json 直接调用 corpus/e2e/smoke/redact/build；acceptance-manifest/telemetry、corpus-db/audit/restart/prepare/cleanup-dry-run、夹具生成、meeting/presentation-fixtures 被验收脚本/测试或对应报告使用。phase7-preflight、phase8-cloud/source-audit、repair-phase8、stage-b-round1-audit 有对应 Phase7/8/Stage B 报告的明确操作引用，且可能涉及保留任务/文件身份，不是无用临时截图。三个定向 migrate 脚本是已审查增量 SQL 的操作入口，不执行它们来验证删除安全。

存在争议但未删除：上述旧搜索审核链、历史阶段/Corpus证据文档、阶段修复与定向迁移脚本。人工判断点是是否继续保留历史协议/原始验收细节，而非已确认死文件。当前没有其他确认无引用且低风险的源码文件候选。

## 5. 开发 E2E 根因与最小修复

清理前定向 Chrome 开发 E2E 复现 30秒超时。读取本次测试 trace 的网络事件（不读取Cookie/header）：第一次 GET /api/demo-session 状态 -1（取消），第二次503，随后没有 health。main.tsx 使用 StrictMode，DemoAccess 的 effect 清理会 abort；原测试按“第二次GET”注入失败，把父级重跑错当冗余子探测，父级停留 checking，App 不挂载。这是测试注入缺陷，不是实证的线上健康故障。

workspace.spec.ts 仅将注入门槛改为 #chat 已挂载；保留父级正常请求到真实 API，进入后仍拒绝冗余 GET。新增浏览器 fetch 返回503断言，随后原来的无第二PPT口令、健康状态、按钮、鉴权、413/布局等断言全部保留。未跳过测试、延长超时、关闭 StrictMode 或修改产品。定向重跑 1/1 PASS（1.5秒），再运行完整开发/生产套件。

## 6. 清理后验证

Node 24.15.0 / npm 11.12.1。check：33文件、265项、类型检查与双构建 PASS；Corpus：17/17 PASS。Chrome 开发 E2E 7/7 PASS（8.8秒），生产 E2E 7/7 PASS（6.9秒）；production smoke PASS（2类配置存在检查、8种启动失败、鉴权/限流/日志脱敏/严格CA启动/ready503，外部业务调用0）。全仓本地Markdown链接无缺失；Demo四文件的SHA、大小及与原件字节一致性4/4 PASS；git diff --check PASS。旧协议 Corpus 是显式外部STUB，不证明当前供应商或公共回答语义准确率。

所有 tests/79 文件、drizzle 迁移/meta、Demo Kit 四份 PDF/TXT 与 SHA 清单保留；Railway启动配置、公开CA复制脚本、所有依赖与锁文件未改。默认测试外部服务隔离，不启动加载真实配置的Worker；真实PG/live/六业务线上复验、原生PPT打开均 NOT_RUN，不能用本轮替身测试声称已完成。

敏感信息检查仅针对当前Git跟踪文件：不打开真实.env/凭据目录，不扫描忽略原始业务产物，不重写Git历史。公开CA不是私钥；连接串模式仅命中 production-smoke、database-config/startup-diagnostic 三份合成测试；未发现私钥块、长Demo Cookie 或供应商Token模式，跟踪清单无真实.env/忽略产物。完整随机Token发现不可能由正则完备保证，历史Cookie生产键是否复用仍由维护者确认。Phase3上传500继续OPEN，README演示地址待维护者补齐。

完成本地独立commit后停止，不Push、不部署、不改云端数据或邮件配置。
