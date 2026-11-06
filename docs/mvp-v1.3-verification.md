# MVP v1.3 — 搜索与聊天原生PPT

MVP v1.3.1：依据下述真实失败完成定向离线修复，原失败证据和结论保留；修复后的真实搜索/两份PPT尚未复测，不能标为Live通过。实现、分层测试和三项复测入口见[v1.3.1记录](mvp-v1.3.1-verification.md)。本文件此前未提交的真实验收报告与本轮一并提交。

2026-11-06。以下 Part A/B 为本地实现历史；文末“经批准的最终真实验收”更新当前状态。真实搜索 FAIL；两份真实 PPT 文件链路 PASS、业务内容 FAIL；原生软件打开 NOT_RUN。0011 已经批准执行。不Push/部署/清理，Corpus Golden不变。

## Part A

只读检查本轮保存的官方搜索快照：查询时间2026-11-06T03:26:00.537Z及一次补搜03:26:03.025Z。同页多个锚点/不同语言返回重复摘要，部分v26 Current、部分泛称LTS，无法仅据此确定Active/Maintenance或完整补丁。重复引用不是独立证据，查询时间不是更新时间。原始模型输出未持久化，不能还原其内部选择。

根因：生产协议仍是单个release/完整补丁及quote选择；模型conflicting标签没有逐项复核；数字聚合不能建模版本线/阶段/时间范围。改为模型生成自然语言claims/issues+精确证据，服务端先校验ID/原文/数字/URL，再用独立受限模型调用逐项审查支持关系、时效、冲突范围。只发布复核通过的结论和差异，不要求中文概括逐字等于英文网页。共存版本不通过字符串数量判冲突，新通道不调用全局LTS正则冲突门禁。旧精确摘录协议仅为兼容既有适配器/固定Corpus保留，不能将其Mock结果当作新生产通道的Live证据。

去重去除URL锚点，对相同正文/发布时间合并；不同正文的快照仍保留，不能按数量投票。补搜最多一次，查询聚焦官方发布/支持状态，失败明确提示；每次最多2个模型调用（归纳+复核），无自动模型重试。输入仍受长度/来源数量/Token及全站调用上限约束，网页不能授权任何工具。结构或复核失败不能发布任意答案。

脱敏诊断仅记候选/排除ID、枚举原因、逐项支持结果；不记录原始问题/网页/模型正文、Cookie或凭据。完整只读业务证据留在忽略目录`.acceptance/mvp-v1.3/inspection.json`，不提交私有任务请求或来源标识到Git。

新固定回归7项：共存LTS/自然语言综合、无证据概括、真正同范围冲突、伪造引用、泛用机构及锚点去重、历史时效、复核失败。最初5项中4项复现失败后修复。真实Tavily和模型仍NOT_RUN，须单独授权，不宣称已解决现场Live验收。

Part A独立提交`dfa56ac`（当时check224/Corpus17通过）。随后补充真实查询时间归纳和不同范围复核一致性两项，搜索新回归共9项；不能以valid=true且reason=different_scope授权冲突。

## Part B 本地实现

只读追踪三个PPT失败任务：均保存了一个选定PDF（包括培训任务），PDF ready且未移除，任务在来源收集前失败。不是文件不存在；选材残留与主题向量检索门槛叠加。需改为聊天附件、明确选定文档读取、普通主题无来源生成；不伪造PDF证据。

已实现：

- 输入框旁`+`可上传PDF、选择已有PDF/一场会议，标签查看/移除；上传解析期间有状态且禁止提交，切会话清空选择，异步上传不把附件加到另一个会话。普通聊天仍走原路由，仅明确PPT指令入队。
- 移除旧主题/页数/来源独立生成表单。PPT仅在聊天发送；发送成功后清空PPT附件，避免下一份普通培训残留资料。历史页只保留文件记录。
- 已选PDF直接按ID读取已就绪的原始chunk，检查removed_at及当前Storage配置，不使用相似度阈值、不调用Embedding、不伪造相关度。每PDF最多24个chunk、总体来源/上下文上限仍保留；超限明确失败，不截断后假装全文。无附件时不因旧knowledgeMode开关要求PDF；选中但失效资料需移除/更换，不回退全库。
- 会议仍读取指定ID最新有效分析与人工待办；归档会议、忽略待办排除。记忆仅在用户明确授权/要求时使用；联网仅接受独立公共问题，关闭联网时拒绝，私有PDF/会议全文不发送搜索。明确要求当前对话时只采集同会话用户陈述。
- 当前会话按conversationId查询任务，消息旁显示规划/生成/完成/失败、文件名、页数及私有下载链接。旧排队消息不冒充当前状态。刷新、会话切换及独立进程恢复保留。轮询只查任务，不重复创建；失败重试保持既有服务端CAS/次数限制。
- 不再UI锁死5–10。明确页数严格校验；未指定用确定性主题长度/资料数量规划5或8页，受配置上限约束。默认`PPT_MAX_PAGES=20`，应用/结构硬范围3–30（封面、至少一个内容页、参考页），不缩字体。超过上限或页数歧义明确拒绝，不擅自凑页/补事实。旧非Golden默认7页/5–10断言按本轮新规格修改，Corpus事实/SHA未改。

### 0011 尚未获执行授权

迁移文件`drizzle/0011_presentation_page_budget.sql`仅在单个事务内替换现有page_count CHECK，从5–10放宽为3–30，不更新/删除任务、文件或任何业务记录。snapshot仅该CHECK及迁移标识变化；已精确离线测试，受控脚本严格类型检查通过。旧Railway写入及读取原5–10页仍兼容，但其旧计划校验器不能下载未来>10页新文件，故共享演示库不应在旧公网版本仍运行时新增这种业务文件。

**已询问用户，尚未收到批准，未执行0011。** 当前共享库约束仍5–10。请求范围外页数在事务中先检查并返回`PPT_PAGE_LIMIT_MIGRATION_REQUIRED`，不插入任务/消息、不让数据库500。3/12/20等范围的结构和渲染已离线测试；云数据库扩展页数是NOT_RUN/WAITING_AUTHORIZATION，不宣称已全面开放新页数。批准后运行显式flag保护脚本，核查父迁移0010与旧行hash；不会由应用启动自动迁移。

## 最终验证分层

| 检查 | 结果 | 真实依赖与替身 |
| --- | --- | --- |
| `npm run check` | 232项/27文件，类型、前后端生产构建PASS | 离线 |
| `npm run test` | 232项PASS | 离线 |
| `node scripts/corpus.mjs` | 17项PASS，Golden SHA不变 | 固定材料/模型替身，真实解析渲染 |
| `CORPUS_SHARED_DB_AUTHORIZED=1 node scripts/corpus-db.mjs` | 11项PASS，270.25秒 | 真实PostgreSQL，外部全STUB |
| 生产Chrome E2E | 最终4项PASS，6.7秒 | 编译API认证真实；业务UI为明确fixture |
| `node scripts/production-smoke.mjs` | PASS | 本地配置/启动/鉴权/限流/日志，0外部业务调用 |

Run `26bf0a3c-ccde-412c-a9a9-515e990b4d8c`：T01–T08及M01/M02/M03通过。新增72条合成记录（会话4、消息36、PDF3、chunk6、会议2、分析2、风险2、证据2、待办3、草稿1、确认1、记忆任务4、记忆3、PPT任务3、邮件发送0），9个本地Storage替身对象，云对象0，既有行hash变化0。精确ID/关系Manifest在`.acceptance/corpus-stage-a/<Run ID>/manifest.json`，全部保留不清理。

M03通过真实聊天服务→任务快照→选材→模型替身规划→PptxGenJS→本地Storage替身→下载：无附件5页、指定PDF/会议/人工编辑待办10页，均真实ZIP/内容/页数校验通过。人工字段核对林岚/2026-11-09/userEdited保留。12页另由离线真实渲染及格式校验通过，没向共享库写入超旧CHECK的任务。

另用独立进程恢复本Run，3份PPT均可读/SHA一致，externalCalls=0。最终选定PDF读取只读检查2个chunk，无虚构similarity，移除PDF拒绝，确认旧页数CHECK仍在。云Storage与真实模型未运行，不能将本地Storage替身当Supabase下载Live。

最终私有存储来源只读检查：同Run存储配置读取2个chunk，其他Storage origin/bucket被拒绝；不修改任何行或文件。这避免显式选择旧测试资料后冒充当前可下载原件。

UI浏览器fixture覆盖：`+`上传/选中/移除、会议移除与重选、无附件指令、组合指令、任务轮询、成功下载入口、故意失败提示与刷新恢复；PDF原模块/会议邮件/记忆/归档/Markdown沿用回归。桌面1280×720及移动390×844逐张看图。初次新增+后移动发送按钮被挤出，已缩短输入区、调整composer高度并增加按钮在视口断言；异步任务卡跟随底部但不拉走主动历史阅读。截图`test-results/chat-native-{desktop,mobile}.png`。

一轮最终生产E2E中，既有超限TXT的413测试出现ECONNRESET（Cookie脱敏）；其余三个业务场景通过。单次复跑4项全通过，没有加入重试框架或修改上传业务。不是已复现HTTP500；原观察项不因此关闭。归纳复核使用同一模型适配器的第二次隔离调用，不是新框架或另一个供应商；它仍可能误判语义，必须经过真实A验收，不能把Mock支持判定视为事实真值。

本轮真实DeepSeek/Embedding/Tavily/Resend/Supabase Storage API次数各0；只有受控PG读写。真实A搜索、B/C模型PPT及原生软件打开均NOT_RUN。询问待批最多4次DeepSeek、2次Tavily Basic、0次Embedding、¥3封顶，先核价/额度，无法核算或任何失败即停、不自动重试；未获授权不执行，未把历史授权沿用。

## 最终人工步骤

1. 新建本地会话，不加附件，输入“生成5页团队沟通培训PPT”。无需PPT页面或第二口令。看同一消息下进度/下载，检查真实5页通用方法，刷新恢复。
2. 在+中选本轮**真实上传且能下载原件**的ORCHID-7421项目PDF和指定会议，避免CORPUS-STUB记录（它们是保留的DB测试资料）。输入“根据刚才选择的PDF和会议，生成10页管理层汇报PPT”。核对人工负责人/期限、忽略项排除、原文页码与会议引用。
3. 删除附件标签后再生成普通培训，确认不会残留要求PDF。取消/刷新切换会话后核对当前附件与当前任务，不混用其他会话。
4. 新搜索原Active/Maintenance问题，记录实际query时间和来源。若摘要只有LTS、状态未知或不同步，允许部分回答及明确缺口，不能靠常识猜版本。核对复核诊断索引与来源ID。
5. 当前仍在旧数据库CHECK内测试5/10页。0011未批准执行前，12页应明确提示迁移要求；不要为通过测试直接改库。新真实PPT仍需PowerPoint/WPS实际打开，程序格式检查不替代人工。

不Push/部署/真实邮件/自动清理；邮件false。Phase3偶发上传500仍观察。**本地自动化修复已完成；扩展页数迁移及真实业务验收仍有明确待授权项，MVP v1.3不能标作Live正式通过。**

主要文件：搜索`search/{service,synthesis}.ts`；PPT`presentations/{documents,sources,service,intent,routes}.ts`及shared/config；前端`ChatAttachments.tsx`、`ChatWorkspace.tsx`、只读`PresentationPanel.tsx`及CSS；0011/快照/受控脚本；`search-v13.test.ts`、`ppt-v13.test.ts`、数据库M03与生产E2E。React检查已按既有清单复核，未新增框架或依赖。

## 经批准的最终真实验收 — 2026-11-06

本节取代上文“0011未批准/真实API未运行”的当前状态，不改写先前离线证据。验收对象为 `dfa56ac` / `0adab65`，本轮只执行迁移、验收与记录，**没有修改业务代码、校验规则、模型提示或固定预期**。未重试模型，未补造来源，未重新渲染修正内容。

### 范围与 Worker 隔离

Run ID：`587aa9f5-c61b-4ab3-ab90-6fb6e4fc684f`。批准上限 DeepSeek 4 / Tavily Basic 2 / Embedding 0 / PPT 2 / ¥3。先读取官方费率与只读余额/用量接口，DeepSeek余额满足上限，Tavily剩余额度满足2个Basic credit；不充值、不开通资源。执行前再次确认 `EMAIL_DELIVERY_ENABLED=false`。

旧部署基线 `85adc7c` 与本地 PPT Worker 均以 `PPT_SCOPE`、Storage origin、bucket 精确过滤领取、过期恢复和带token写回。本轮新建随机128-bit Scope（完整值只留本地Manifest），确认与本地配置及全部既有任务Scope不同；已运行旧Worker的启动环境不会取得之后生成的新值，因此不会领取本轮任务。没有读取或修改Railway环境；该结论以已检查的旧Worker精确匹配代码及进程环境不动态改变为依据，不冒充云端运行状态探测。

本地 `127.0.0.1:3183` 验收进程使用真实已构建React界面、Demo认证、聊天/PPT路由、服务与数据库/Storage/模型适配器；列表只读限定到本轮会话及选定材料。**不启动全应用后台Worker**，仅对新Scope的两个队列任务各手动调用一次现有 `processOne()`，无记忆/会议/文件/邮件Worker，无Embedding。这样避免启动旧业务队列或自动重试消费额度。此为受控真实业务链路验收，不是未经限制的完整生产启动Live E2E；无资料上传或资料重新分析。

### 0011：PASS（真实 PostgreSQL）

实际命令（PowerShell）：`$env:APPROVE_PPT_BUDGET_0011='1'; node --import tsx scripts/migrate-ppt-page-budget.ts`。

脚本验证迁移父版本0010和固定迁移集合，在Drizzle事务中仅替换 `presentation_page_count_check`。迁移前后旧任务整行hash一致；最终只读复核68条既有任务均未改变，原页数最小5/最大10、不兼容行0。当前约束为 `CHECK (((page_count >= 3) AND (page_count <= 30)))`。未改PPT内容/任务历史，未删除/重置数据。旧版原5–10页读写兼容；旧规划器对未来>10页仍不兼容，本轮任务仅5/10页且Scope隔离，不能据此宣称旧公网版本已支持3–30页。应用默认资源上限仍20页。

证据：`.acceptance/mvp-v1.3/migration-receipt.json`；本轮Manifest的旧任务hash和 `final-audit.json` 的页数/兼容性核查。

### 真实搜索：FAIL（已联网，未完成回答）

使用用户批准的完整 Active/Maintenance 问题、required模式。真实 Tavily Basic 2次（主查询+一次有界补搜），各返回HTTP200/1 credit；DeepSeek实际1次，返回有效JSON、finish_reason=stop，7058输入/763输出tokens。原始快照每次5条，均为Node.js官方域名，包括 [英文版本状态页](https://nodejs.org/en/about/previous-releases)、[中文状态页](https://nodejs.org/zh-cn/about/previous-releases)和官方发布索引。补搜有多个同页锚点；现有服务确有锚点/相同正文去重，不能把它们计为独立支持票数。部分摘要同时有v26 Current、v24/v22泛称LTS和博客26.13.0 LTS；仅泛称LTS不能证明Active/Maintenance细分。

**实际失败阶段是 `search/synthesis.ts` 的结构校验，不是已证实的“生命周期冲突”**：模型给出7个claims（schema最多6），第一个claim有7条evidence（最多4）。`SEARCH_INVALID_CITATION` 在来源ID解析、逐字引用和独立语义复核之前抛出，复核模型未调用。模型claims中还直接写URL，若进入下一阶段会触发既有禁止自行输出链接的门禁；没有关闭该约束绕过。`search/service.ts` 的规划提示给出了结构示例，却未声明这两个数组上限和正文URL禁用规则，是本次可由代码与原始输出确认的协议缺口；模型仍不能从当前摘要确认两个阶段，修复协议也不等于证据问题已解决。

失败assistant消息：`07e98640-4420-4ccb-8472-b57ba612a9ab`，status=failed、content为空、`SEARCH_INVALID_CITATION`、webSources为空。刷新及独立进程重启后失败记录恢复。**没有成功回答或持久化成功引用，不将诚实缺口或HTTP200算业务PASS**。数据库请求/完成窗口 `2026-11-06T04:39:13.466Z`–`04:39:31.451Z`（北京时间12:39）；未成功显示每条来源查询时间，故该验收项FAIL。原始Tavily快照无应用侧queriedAt，不能事后用文件时间冒充精确查询时间。原始模型输出含约04:39 UTC的时间说明，仅属未发布输出。

脱敏诊断：`stage=synthesis_schema; code=SEARCH_INVALID_CITATION; claims=7/max6; claims[0].evidence=7/max4; review=NOT_RUN`。来源选择全为任务对应官方域，非官方排除0；失败前无逐项语义支持/冲突裁决结果。完整真实响应保留在忽略目录 `search-{1,2}-response.json` / `llm-1-response.json`，另有 `search-result.json` / `search-receipt.json` / 刷新截图；不将未经验证的输出作为答案引用。

### PPT-A：文件链路 PASS，业务内容 FAIL

真实输入：“生成 5 页中文 PPT，主题《如何提高团队沟通效率》，面向企业新员工。”未选PDF/会议，记忆/搜索关闭。来源只有用户要求；真实DeepSeek1次，827输入/205输出tokens。任务 `fefc49e6-ec06-4010-8d89-fe7664b58084`，ready，attempts=1/retries=0。无第二PPT口令，无 `PPT_PDF_EVIDENCE_MISSING`。

实际PptxGenJS生成5页/36个ZIP parts，24,485 bytes，私有Storage上传、真实下载、CRC/关系/页数/尺寸校验均通过。SHA-256：`623dee47acbc6a227c6b9fe549372d98a14307542fb28e1725fe93edf55a32c6`，本地/数据库/刷新后及重启后下载一致，未登录401。

内容失败：第1页标题只有“中文”。`presentations/intent.ts` 的topic取生成动词后的第一个逗号分句，清除页数/PPT后留下语言修饰词，遗漏后面的明确主题；完整用户要求仍传给了模型，不能归因于模型未收到主题。第2–3页含“建议结合新员工常见场景举例”“建议培训目标设定为”等培训创作建议，缺少所请求的实际教学内容；第4页有可用表达/倾听/反馈方法，但不能覆盖整份培训任务完成度。保留原输出，不手工改成一份通过的PPT。

### PPT-B：文件链路/来源快照 PASS，业务内容 FAIL

使用原真实上传Run `cee51f13-79e6-42d6-9caa-dc21b81cf079` 的 ORCHID-7421项目PDF（真实私有原件2354bytes、2页/2chunks）及已分析会议v4；先只读下载解析核对项目代号，不用CORPUS-STUB文件、不上传新资料、不调用Embedding。使用用户批准的10页完整输入。任务 `c0055f47-77f4-432e-9fd1-94dc3afdbc74`，ready，attempts=1/retries=0；DeepSeek1次，2399输入/667输出tokens。

实际10页/56个ZIP parts，46,242 bytes。SHA-256：`db7a3b9e20b6be66362b1798a40b7a536716750a20cf868306352a24ec1d3639`，本地/数据库/真实Storage下载、刷新、独立进程重启后均一致，未登录401。

通过项：来源仅用户要求、所选PDF和所选会议/风险/当前有效待办；未读取其他历史PDF、会议、记忆或网页。4项入选待办均为当前人工编辑版本，task/owner/dueDate/version与DB逐项一致，1项已忽略待办排除；另一待确认事项由既有规则排除。每项quote均通过生产 `verifyPlan` 完整原句/来源ID检查，PDF引用有页码，会议来源有原文/行号，notes保留源事实与人工修改版本。第4–5/7页保留“高风险不等于已确认延期、保留2026-11-20目标、不确认新上线日期”，没有把未批准改期当决定。

业务失败/局限：

- 第5页引用人工修改的“复核供应商交付清单”S10，但与风险混排，页面归为risk；模板只在纯todo页面显示owner/dueDate，因此正文漏掉最新负责人林岚、截止2026-11-09（备注完整保留，未误写为原会议的周宁/11-08）。第9页其他待办显示正确，不能据此宣称关键人工修改项已完整展示。
- 第6页无范围限定地写“现有资料不足以确认风险”等固定缺口，与同一份已提供并展示的高风险证据相矛盾；现有校验只验证缺口枚举，没有验证是否与已知证据冲突。不能算内容一致性PASS。
- 第3–4页把合成材料标记/预算/测试访问码放进进展/风险页，并有英文原句；它们真实存在于所选合成PDF，**不是来源编造**，但与中文管理汇报的相关性/组织质量不足。没有将合成测试码当真实凭据处理或改动业务事实。

### 页面、UI及恢复

真实浏览器在同一次Demo登录后直接由聊天发送，无PPT独立口令表单。B在 `+` 中选/移除/重选PDF及会议，附件标签、queued/planning及完成卡、文件名/页数/下载均可用。A/B刷新恢复当前会话和下载入口；结束原进程后，新只读进程重新登录，均从真实PG/Storage恢复相同文件。匿名访问A、B及一个既有历史PPT下载均401，没有公开私有对象。

全部15页均从原始PPTX导入本地Artifact Tool渲染PNG，并逐页人工看图：中文可读，未见明显文本溢出/遮挡/空白页；B9表格三行完整，B10参考资料正文最多5项、其余在备注，现有长文件名被缩略，不冒充原文引用。**版式基本通过不能掩盖以上业务内容FAIL。** 渲染器不是PowerPoint/WPS；两份原生软件实际打开均 **NOT_RUN，等待用户人工确认**，不宣称已通过兼容性。

验收驱动本身记录：初次A驱动因局部变量遮蔽 `process` 在登录前ReferenceError（0生成/0付费调用），修正的是忽略目录脚本。后续A已生成文件后首次刷新检查中断，保留 `a-ui-error*.json`；独立只读驱动等待异步恢复后，刷新/重启/下载均通过，没有重新入队/生成。首次用Windows CIM定位进程被环境拒绝；通过本工具原先持有的进程句柄停止，再启动只读进程成功；中间一次端口占用启动失败没有新增任务/API调用。均不作为产品PASS证据掩盖。

验收服务故意未提供完整主页配置/辅助模块，真实截图可能出现整体“后端连接失败”提示；它不等于本轮已测路由/数据库失败，也不能据此宣称完整启动健康检查PASS。完整编译API健康/工作台入口由以下明确隔离的生产E2E验证。默认Scope仍保留，**本轮两份任务只在新验收Scope可见，不会自动出现在默认PPT列表**；需要复核原会话UI时，可用保留的 `node --import tsx .acceptance/mvp-v1.3-live/server.ts --readonly` 启动3183端口并用既有Demo口令登录，不能为方便访问擅改Railway或根`.env`的Scope。

### 测试层级与实际命令

| 检查 | 本轮结果 | 边界 |
| --- | --- | --- |
| `npm run check` | PASS：232测试/27文件、类型、两端生产构建 | 外部服务替身/离线，不能覆盖Live失败 |
| `node scripts/corpus.mjs` | PASS：17项，Golden未改 | 固定快照/模型替身；真实解析渲染 |
| `$env:PLAYWRIGHT_CHANNEL='chrome'; npm run test:e2e:production` | PASS：4项，11.9秒 | 实际编译API/Demo认证，业务UI fixture，无付费调用 |
| 真实搜索 | FAIL | 真实PG+Tavily+DeepSeek；结构拒绝，未复核发布 |
| PPT-A/B文件链路与恢复 | PASS：各1份 | 真实PG/DeepSeek/Supabase Storage，现有Worker手动单步 |
| PPT-A/B业务内容 | FAIL | 上述已定位标题/内容/待办展示及缺口矛盾 |
| 原生PowerPoint/WPS打开 | NOT_RUN | 两份原文件保留，等待用户，不计通过率 |

第一次不指定channel的生产E2E因本机缺Playwright默认headless shell而在4项浏览器启动前失败；未安装额外软件，使用现有Chrome/项目已支持的环境变量后通过，不隐去首次失败。先前11项真实DB+外部STUB仍为上节历史结果，本轮未重复新增该套72条测试记录；本轮真实DB验证为上述迁移、业务写入/恢复和只读核对，不能把历史结果计为新Live全套PASS。

### 用量、数据保留与人工检查

实际DeepSeek **3/4**（搜索规划1、A规划1、B规划1），共输入10,284/输出1,635tokens；Tavily Basic **2/2**（2credits）；Embedding **0**、Resend **0**，真实PPT **2/2**。没有模型自动重试，剩余1次模型额度不继续使用。按[DeepSeek官方费率](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)与[Tavily Basic credit规则](https://docs.tavily.com/documentation/api-credits)预检；忽略缓存/低峰/免费额度优惠，并用¥3/百万输入、¥12/百万输出及¥0.08/Basic的保守计价，合计上界 **¥0.210472（向上取¥0.211）**，请求前累计最大预留¥0.524410，低于¥3。不是账户实际扣费账单；Tavily当时额度足够，不启用新付费。Storage本轮共上传70,727bytes，下载含只读检查/重复校验小于1MB，未新建资源/升级套餐。

新增并保留：会话3、消息6、PPT任务2、私有PPT对象2；不新增PDF、会议、风险、待办、草稿、记忆或Embedding，不清理旧/失败记录。精确ID/关联/Storage对象标识只留忽略目录Manifest与 `final-audit.json`；不输出私有对象路径、Cookie或凭据到报告/公开日志。已有68条PPT整行hash变更0；所选资料只读且当前人工待办快照逐字段核对一致。没有对其他业务表做全表hash比较，不将只读检查说成完整生产审计。

本地原件（不入Git）：

- `.acceptance/mvp-v1.3-live/A-communication-5.pptx`
- `.acceptance/mvp-v1.3-live/B-management-10.pptx`

Windows用PowerPoint/WPS直接打开上述原件：确认无修复提示、5/10页、中文/表格/备注；重点检查A1主题、A2–3培训内容，B5人工待办与备注、B6缺口矛盾、B9待办表格。人工打开成功也不能关闭已记录的业务内容失败。逐页PNG在同目录 `render/`，完整输出及诊断均保留，不以另造文件替代失败版本。

**结论：0011、文件生成/私有下载/持久化、聊天附件UI及离线回归通过；搜索及PPT内容质量仍有阻塞，MVP v1.3最终真实业务验收不通过。** 本轮停止在验收报告，不新增功能/修复，不Push、不部署、不清理、不发信，等待用户审查。Phase3偶发上传HTTP500仍为观察项。
