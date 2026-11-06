# MVP v1.2 — 第二轮人工缺陷修复

2026-11-06。本轮不部署/Push、不使用真实模型/Embedding/Tavily/Resend、不清理已有数据，邮件关闭。Corpus v1固定材料与SHA不变。

## 里程碑一：搜索与PPT（FIX-01/02，及共用PDF范围）

先增复现：4项中3项失败，分别是旧发布文与当前状态表误判冲突、反向状态表无法支持概括、本地未登录Context时仍渲染独立PPT口令表单。真实第二轮原始模型响应未保存，本轮不以代码复现冒充已重放真实服务。

搜索根因：LTS版本/状态正则的空白可跨行，将Active状态与下一行版本串联；历史发布页与当前状态页未区分；模型conflicting标签即使有完整可验证的结构化证据也一律拦截。现限制同一行关联版本和状态，Active与其他版本Maintenance共存不冲突，当前状态页优先历史发布文。仍拒绝同期互斥的明确最新声明、同版本相反状态、伪造ID/非原文引用。LLM选择多源结构化version/status/evidence后服务端验证并归纳中文；没有明确最新补丁证据时保留限制。官方域名按任务机构选择，不将Node.js域名用于所有问题。

必要时最多补充一次Basic搜索（初搜缺少近期、可关联完整版本的官方状态证据时），不自动重试上游错误；相同URL和摘要去重，不同摘要保留各自来源ID与查询时间，上限10条，每来源最多40个完整引用选项，沿用服务调用预算限制。补充检索额度/超时等失败明确显示，不能冒充补搜成功。没有新付费调用。冻结时间证据仅是MOCK，不是当前Node.js版本声明。v1.1非Golden测试中“两个Active版本线即冲突”的错误期望按本轮需求纠正；真正最新补丁矛盾断言保留，Corpus Golden未改。

PPT根因：旧UI在DemoContext=false时回落到独立口令表单；本地只有PPT_ACCESS_KEY时没有统一Demo登录。已删除前端表单和解锁/锁定操作。统一Demo认证优先DEMO_ACCESS_KEY；旧本地仅配置PPT_ACCESS_KEY时用原秘密登录一次全站Demo，旧cp_ppt单独不能绕过全站门禁。生产仍要求显式DEMO_ACCESS_KEY；已有文件、任务Scope与Storage路径不变，无需重生成。没有两个密钥时私有PPT仍拒绝访问。

PPT设置按主题、5–10页及可选资料组织；“填入生成指令”不调用模型，发送才入队。普通主题默认不取历史聊天/PDF/会议/记忆/网页；当前会话、指定PDF、一场会议、记忆均需显式选择，公共搜索词独立提供。PPT不沿用普通问答的全库开关或required模式，避免无意扩大来源/外发私有内容。最新外部资料没有独立公共查询时明确报缺失，不猜测。旧未限定PDF的失败任务若需重新规划，须按新范围重新提交；历史已生成文件下载不变。

共用RAG新增可选documentIds：省略为全库、空数组为无文件、非空数组仅查询指定ID；ready预检及实际向量查询均约束范围并排除removed_at，历史引用保留。聊天与PPT分别选择范围，不默认共享历史PDF。没有SQL结构变化。

离线用模型替身验证：A普通培训5页、B选定PDF/会议风险/人工任务版本/记忆10页，均经过真实PptxGenJS渲染与ZIP/页数/文本布局约束校验。不是模型Live或原生软件打开验收。

初阶段check207项、类型及双构建通过；Corpus17通过。生产E2E首次因旧文案断言失败（仍期待已删除的PPT表单/提示），更新断言以明确验证表单不存在，不放松后端鉴权检查。最终回执见后文。

## 其余修复与最终验证

核心阶段生产E2E更新后3项通过；本地核心提交后再进行其余修复。FIX-04的0010单列可空迁移已获用户批准，须先完成文件审查和离线测试再执行。真实外部服务人工复测统一NOT_RUN，等待用户。

核心独立提交：`c8f9d8f`。随后只读核查人工失败的已保存官方快照：查询时间为2026-11-06T01:18:21.611Z，previous-releases/download/releases表将v26列为Current，about/releases表将v26列为LTS；发布时间均未提供，下载摘要没有完整版本号。这既有摘要缺失，也有页面差异，**不能仅凭这些快照断言精确补丁或擅自统一状态**。新增此形态的冻结回归，验证有界补搜后有明确证据才归纳，否则保留不足/差异。release/release-article和releases目录不再仅因名称相近混为一类；版本状态表支持跨列关联，不跨行串错状态。

原始模型JSON未持久化，本轮无法还原当时选择过程，不假称已复现真实模型。只读检查最初命中新建STUB冲突记录，随后明确排除MOCK/STUB/evidence-gate标签才命中人工记录；两份本地证据分开保留，首份不计作真实失败证据。

### FIX-03 / FIX-05 / FIX-06

- Markdown原受限渲染器没有表格分支。新增GFM表头、分隔行、列对齐、行、转义管道及内联语法；表格自己横向滚动，React转义HTML，危险链接仍禁用，代码块不当表格解析。不安装新依赖，不宣称完整GFM所有扩展。
- 会议原先只过滤风险/行动注入，议题/决策未过滤，且UI直接合并显示。先以Corpus L11复现，再对事实同样核对整行可信边界；纯UUID/Run标记不作为议题，保留混合行中的业务事实及完整原文。可选category/scope区分议题、决定、提议、待确认及其他项目背景；明确未批准的提议不当最终决定。分类后超限拒绝，不截断重要事项。历史分析仅在读取时投影净化，不回写原记录。会议原文和物理行号不变，人工待办保护不变。
- 邮件主标题仅“邮件草稿”，以已确认/待复核/草稿已更新说明状态。版本移入折叠详情；待办变化警告、最新预览、保存、重新确认与发送关闭不变。数据库确认/并发规则没有放宽。

### FIX-04 迁移与兼容

已获明确授权。0010 SQL只有`ALTER TABLE meetings ADD COLUMN archived_at timestamp with time zone`，没有默认值/回填。SQL和snapshot仅增加批准的一列，LF固定；离线精确DDL及snapshot测试、脚本严格类型检查、check均通过后执行。父迁移必须为0009，未知状态停止。执行后nullable=YES、default=NULL、当时非NULL数0，旧会议行忽略新键后的ID/内容哈希完全一致，旧字段投影可读。收据`.acceptance/mvp-v1.2/migration-receipt.json`。

后端提供鉴权软归档，前端二次确认；默认列表、Worker新领取和PPT选定会议校验均排除。归档后禁止新的重新分析，保留历史详情/原文/风险/待办/草稿/私有对象；新记忆召回也排除归档会议，已保存消息引用不改。进行中的任务可能完成，不取消或销毁原件。旧Railway旧字段读取结构兼容，但旧程序不执行新归档过滤；本轮不部署，也不声称旧站已更新。新版正式运行前必须应用0010，本次共享库已应用。

## 最终自动化与留存

| 层级/命令 | 实际结果 | 依赖 |
| --- | --- | --- |
| `npm run check` | 217项、24文件；类型检查/前后端生产构建通过 | 离线 |
| `npm run test` | 217项、24文件通过 | 离线 |
| `node scripts/corpus.mjs` | 17项；Golden SHA不变 | 冻结材料、模型替身、真实解析/渲染 |
| `CORPUS_SHARED_DB_AUTHORIZED=1 node scripts/corpus-db.mjs` | 完整复跑10项PASS，254.85秒 | 真实PostgreSQL；所有外部服务STUB |
| `PLAYWRIGHT_CHANNEL=chrome node scripts/e2e.mjs production` | 最终4项通过，5.7秒 | 真实编译服务/API鉴权；业务UI fixture |
| `node scripts/production-smoke.mjs` | PASS：配置2、启动失败3、readiness503、认证/限流/脱敏/SPA | 本地生产，无真实业务服务 |

数据库首轮Run `de9c39d9-f0a4-424c-9c8a-cc91c508de7a`：9 PASS/1 FAIL，237.99秒。M02在独立连接下载时错误传入null模型，触发现有配置门禁；修正测试为不调用的模型替身，没有绕过生产校验。保留失败证据，不算整轮通过。

复跑Run `6b7fdc94-c644-483f-8651-d639e1c7ce0c`：T01–T08、M01、M02共10 PASS。验证聊天/引用/记忆/搜索/邮件版本/任务幂等恢复，指定PDF不串其他文档且移除ID不命中，会议归档后列表/PPT排除但原详情与草稿不变；PPT独立进程恢复与下载SHA、修复版本和旧对象保留沿用T08，M02另用独立连接恢复归档状态与下载。

两个Run各66条：会话4、消息32、PDF3、chunk6、会议2、分析2、风险2、证据2、待办3、草稿1、确认1、记忆任务4、记忆3、PPT任务1、真实邮件发送记录0。合计132条；每Run7个本地Storage替身对象，共14个，云Storage新增0。既有记录哈希变化均0；全部保留，未清理。另有0010迁移日志1条。精确ID/关联/本地对象在`.acceptance/corpus-stage-a/<Run ID>/manifest.json`。

本轮DeepSeek/Embedding/Tavily/Resend/Supabase Storage API调用各0，费用0；数据库受控操作不计作外部模型Live。真实T06搜索与真实PPT A/B生成均NOT_RUN/WAITING_MANUAL_ACCEPTANCE，不将首轮人工PASS或历史Phase8证据挪作本次模型验收。

视觉：逐张查看1280×720和390×844截图`test-results/chat-v2-desktop.png`、`chat-v2-mobile.png`；中文、表头/边框、横向滚动容器、输入区与整体页面无明显溢出。浏览器断言表格自身scrollWidth大于clientWidth而页面不横向溢出；Markdown HTML/脚本不执行。新PPT两个离线场景未在PowerPoint/WPS实际打开，不声称原生验证通过。

## 人工最终复测与发布门槛

1. 本地统一Demo登录一次。只配置旧PPT_ACCESS_KEY的本地环境可用该原口令登录全站；显式DEMO_ACCESS_KEY优先，建议正式环境只以Demo登录操作。刷新、退出重登、新会话无PPT第二口令；未登录直接下载应401。
2. PPT页主题“团队沟通培训”、5页、所有资料留空→填入生成指令→发送。检查内容为通用方法/建议，下载真实5页可编辑PPTX。
3. 新会话选Corpus项目PDF、指定会议、勾记忆；主题ORCHID-7421管理层汇报、10页。核对人工待办负责人/日期、忽略项排除、每条事实来源与页脚；不要默认用全库。真实调用仍需用户预算授权。
4. PDF问答选“仅选中的PDF”，选本轮上传的副本；历史相同内容文件不应成为新引用；全库模式仍可选。移除ID不被新检索引用，旧引用下载保留。
5. 仅用自己的合成会议练习移除/取消/确认/刷新，原历史来源仍可访问；核对议题/提议/待确认/背景，L11不出现在业务结果。不要清理旧Run。
6. 搜索原问题，核对当前证据、两个支持阶段、官方来源与查询时间；不得只按“语句流畅”判PASS。证据仍不足应保留拒答，不强制认为必须成功。新付费搜索/模型本轮未执行。
7. 邮件标题状态、折叠版本、来源变化提醒、更新预览、保存与重新确认；真实发送保持未启用。

自动化/迁移层无已知阻塞；发布前仍须用户确认真实搜索与PPT及UI操作，当前不是新版本Live正式通过。旧Phase3偶发上传500继续观察。不Push、不部署、不改凭据、不发送邮件、不自动清理。

### 主要修改位置

| FIX | 实现与回归位置 |
| --- | --- |
| 01 | `apps/api/src/search/{service,evidence}.ts`、`tests/unit/{mvp-v12,search-current,mvp-quality,stage-b-round1}.test.ts` |
| 02 | `demo/access.ts`、`presentations/{auth,service,sources,plan}.ts`、`PresentationPanel.tsx`、`ChatWorkspace.tsx`、shared契约、`mvp-v12.test.ts`与生产E2E |
| 03 | `SafeMarkdown.tsx`、`workspace-v2.css`、`markdown.test.ts`及桌面/窄屏E2E |
| 04 | `management.ts`、`meetings/service.ts`、`memory/service.ts`、`MeetingPanel.tsx`、0010及snapshot/迁移脚本、迁移单测、DB M02 |
| 05 | `meetings/analysis.ts`、`shared/meetings.ts`、`presentations/sources.ts`、`MeetingPanel.tsx`、`meeting-v12.test.ts` |
| 06 | `MeetingPanel.tsx`，既有邮件版本/旧确认保护及真实发送关闭回归不变 |
| 07 | `knowledge/retrieval.ts`、`chat/service.ts`、`shared/chat.ts`、聊天/PPT文件选择、真实DB M02和浏览器范围断言 |

React检查：无新增组件库/框架，Effect清理AbortController，来源查询相互独立；安全内容不使用innerHTML，表格可键盘聚焦滚动，表头scope=col，危险链接/原始HTML回归通过。会话切换清空PPT资料选择，避免沿用上一会话的资料授权。PPT页每次打开刷新有效文件/会议列表；归档会议由后端拒绝，移除PDF不会命中，不回退到任意历史资料。
