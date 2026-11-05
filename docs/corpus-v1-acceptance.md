# Corpus v1 与本地综合业务验收

日期：2026-11-05。基线：搜索修复85adc7c。范围仅质量工程；没有改业务实现、数据库Schema、生产配置或部署。

结论：Part A确定性基准已建立；Part B可免费执行的组件检查和生产壳E2E完成。**本轮六能力完整真实业务验收尚未通过，数据库层NOT_RUN，真实服务层NOT_RUN / WAITING_AUTHORIZATION。** 不把Mock、历史证据或结构检查算作本轮真实业务通过。

## 执行前盘点与复用

阅读AGENTS/SPEC/TASKS/README、Phase3–9验证记录、现有unit/integration/browser tests和fixtures、85adc7c搜索质量测试。对.acceptance进行文件清单盘点，并解析既有JSON收据提取布尔统计；未将原始内容、会话Cookie、私人文件或对象路径搬入Git。

| 范围 | 已有覆盖/明确预期 | 可复用材料或证据 | 证据性质与限制 |
| --- | --- | --- | --- |
| 聊天 | 顺序/上下文上限、重复请求、历史/中断状态 | chat.test、Phase2/3记录 | unit为STUB；既有DB/模型证据不是本轮同场景结果 |
| PDF | PDF.js物理页、chunk边界、引用ID/逐字核验、空证据、文件大小 | rag-project/owner/no-text.pdf、knowledge.test、Phase3 | PDF为合成可提交；历史真实向量/RAG已验收，但回答仍是摘录型 |
| 会议 | TXT行号、未知人名日期、风险、人工todo/draft保护、确认版本 | meeting-risk/safe/unknown-injection.txt、meetings.test、Phase4 | 旧ORCHID-MEET等与统一场景不同；复用逻辑，不混为一个项目 |
| 记忆 | 原文/指纹、同名/冲突、来源ID、scope | memory.test、Phase5 | 历史真实召回有记录；给定候选单测不证明跨会话检索 |
| 搜索 | auto/required/off、最小查询、错误/超时/限流/额度、真实ID、官方/时效 | search.test/search-current.test、Phase7、85adc7c | Phase7为真实服务历史；85adc7c新增7项为固定MOCK；当前版本不由旧记录证明 |
| PPT | 5/10页、ZIP/关系/几何、完整引文、官方限制、发布并发/幂等/恢复 | presentation-fixtures、PPT tests、Phase8 | 旧fixture青杉项目不当作ORCHID事实；Phase8四真实文件已由用户确认原生打开，不能替代新Corpus |
| 邮件 | 精确版本确认、去重、不确定状态、错误脱敏 | email tests、Phase6/8 | 两封真实邮件历史已确认；本轮不发信、不复用真实收件人 |
| 部署 | 全站后端鉴权、大小/调用限制、重启/缺配置日志、TLS | deployment/demo-access/database-config、Phase9 | 当前离线E2E无业务DB；用户报告公网TLS/聊天/记忆/Tavily可用，作为用户报告而非本轮实测 |

历史.acceptance中的原始会议、模型响应、账号/对象标识、下载文件和usage日志不适合进入Git。目录仍被忽略。历史Cookie事件已记录测试scope更换失效，当前单元测试继续覆盖分块Cookie/Auth输出脱敏及旧scope失效；本轮没有读取或打印Cookie/密钥。

原有质量缺口主要是材料分散、不同项目事实缺少统一预期、搜索旧文章冲突缺乏统一入口、持久化证明容易与Mock混算。本次新增统一ORCHID-7421材料、Zod案例定义、冻结时钟、输入SHA、逐Case结果及分层报告；不新建评测平台。

## 数据库隔离门禁：停止写入

用户有条件批准现有测试PostgreSQL，仅合成、外部全替身、必要读写、无DDL/迁移、不触及旧记录，并要求先证明不会出现在公网Demo。

检查发现：

- `chat/service.ts`：list直接查询conversations；history只按conversationId。conversations/messages没有工作台Scope过滤。
- `knowledge/service.ts`：list直接查documents，get/download按id。Worker按storageOrigin/bucket/embeddingSpace隔离；这不是界面可见性隔离。
- `knowledge/retrieval.ts`：按ready/embeddingSpace查询，不能证明整个Corpus资料对公网检索不可见。
- `meetings/service.ts`：list直接查meetings，详情按id；sha256去重也跨会议全表。独立Storage标识不隔离列表。
- 记忆有scope，PPT/邮件任务有scope，但不能为其会话、PDF和会议提供完整隔离。

**未获得“测试库独立于Railway”的可靠证据**，因此既不能判定共库也不能假定不共库。代码已证实仅设置独立worker Scope不足；按停止条件不加载数据库配置、不发起数据库连接、不执行任何integration写测试。实际新增：会话0、消息0、PDF/chunk0、会议/风险/todo/draft0、记忆0、任务0。无迁移、DDL、删除或更新旧数据。

`npm run test:integration`：**NOT_RUN / ISOLATION_NOT_ESTABLISHED**，不是命令执行后通过，也不算失败测试。不要直接运行现有integration套件来绕过此门禁。继续条件是提供已有、与公网独立且Schema已就绪的测试库并单独确认；不为本轮擅自建库/改Schema/新增多租户。

## Corpus 执行结果

固定定义见tests/corpus/v1/cases.ts，材料与扩展规则见该目录README。8案例，17项确定性检查，已执行项全部PASS；8/8只指离线案例层，不是Live通过率。

| ID | 离线层级 | 结果 | 事实/引用检查 | 本轮持久化/恢复 | 外部服务 |
| --- | --- | --- | --- | --- | --- |
| T01 | Unit | PASS | 完成消息顺序、边界、8案例契约与6输入SHA | NOT_RUN | 无 |
| T02 | Unit + parser/answerer组件 | PASS | 实际3份PDF共6页；访问码/预算/负责人/地点；服务端页码、原文匹配 | NOT_RUN | LLM/检索STUB |
| T03 | Unit | PASS | 空候选/空选择拒答；虚构ID/日期被拒 | NOT_RUN | LLM STUB |
| T04 | Unit | PASS | 11行TXT、high、周宁/2026-11-08、null未知；编辑身份稳定 | NOT_RUN：人工编辑防覆盖/草稿确认事务尚未复跑 | 结构化输出STUB，无发送 |
| T05 | Unit | PASS | 林岚/南京/明确时间、同名证据区分、伪造事实/ID拒绝 | NOT_RUN：给定候选不证明检索/跨会话 | 候选/LLM STUB |
| T06 | Unit + transport STUB | PASS | 近期官方明确结论、旧文不作当前结论、Python/PostgreSQL机构、域名伪装、查询隐私、429/402/500/无结果 | NOT_RUN | 搜索/模型STUB |
| T07 | Unit | PASS | 目标与未批提议分开；新官方版本冲突拒绝确定结论且保留引用 | NOT_RUN | 选择器STUB，非真实模型语义能力证明 |
| T08 | planner/renderer组件Integration | PASS | 真PPTX5/10页，多来源覆盖，事实/分析/建议、官方/完整引文/结构/表格字段 | NOT_RUN：无云上传/下载 | planner模型STUB；真实本地渲染 |

结果JSON保存Case ID、层级、结果、失败断言、DB/E2E/Live未运行原因和外部调用数。单例T06也实际运行通过，其余不计分母。旧套件继续提供超时、草稿/邮件权限、Cookie、PDF上传413等边界覆盖，不重复实现框架。

初跑16项中15通过1失败：新测试错误要求同一来源完整摘要出现在去重后的quote字段。核查现有协议后改为逐字包含+版本+日期，结论原文和Golden事实未变。新增Golden校验后17项通过。不隐瞒初跑，不通过修改基准掩盖业务回归。

## Part B：按用户操作顺序的结果

Corpus通过后执行生产模式E2E、编译启动smoke、PPT独立检查和逐页视觉复核。因为数据库门禁失败，不能启动连接现有真实配置的Worker，也不能把直接调用纯函数说成真实工作台业务操作。

| 六能力 | Case | 本轮完整用户流程结果 | 已执行方式/实际结果 | 未运行及交付影响 |
| --- | --- | --- | --- | --- |
| 多轮聊天 | T01 | NOT_RUN | 上下文Unit PASS；生产SPA登录/刷新/退出 PASS | 新建/切换/重启后的业务历史未测；阻塞本轮综合正式通过 |
| PDF RAG | T02/T03 | NOT_RUN | 真实PDF.js/引用门禁+模型STUB PASS | 上传、索引、真实拒答未测；阻塞本轮综合正式通过 |
| 会议与待办 | T04 | NOT_RUN | 真实解析/行号/动作身份 PASS | 上传、人工修改持久化、重分析、草稿/确认事务未测；不发真实邮件 |
| 长期记忆 | T05/T07 | NOT_RUN | 原文、同名、ID门禁 PASS | 任务提取、跨会话检索、冲突召回/重启未测；阻塞本轮综合正式通过 |
| 联网搜索 | T06/T07 | NOT_RUN / WAITING_AUTHORIZATION | 冻结搜索及模型STUB PASS | auto/required实际调用、当前官网可达与实时事实未测；历史Tavily PASS不替代 |
| PPT汇报 | T08 | NOT_RUN / WAITING_AUTHORIZATION | 真实文件5/10页和15页视觉 PASS | 真模型、Storage、鉴权下载、历史/重启未测；新文件原生打开NOT_RUN |

六个Live业务流程本轮执行0，不计算Live通过率。生产E2E是实际browser→编译Fastify→unconfigured响应，覆盖全站鉴权401、页面控件/模式切换、SPA深链/刷新/移动端；不声称六业务持久化通过。

## 实际命令与证据

- `npm run check`：PASS，181测试/17文件、TypeScript与服务端/前端生产构建通过。
- `npm run test:corpus`：PASS，17项，8案例。`npm run test:corpus -- T06`：PASS，3项，其余跳过不计通过率。
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e:production`：PASS，1项，真实编译服务与Chrome，DB/外部服务未配置。
- `npm run test:production:smoke`：PASS，2项配置presence、3种启动拒绝、未配置/不可达DB的ready503/health200、生产SPA、鉴权/429、日志脱敏与关闭。businessPersistence=false，externalBusinessCalls=0。
- Windows工具运行npm脚本使用等价的 `node <本机npm安装目录>/bin/npm-cli.js run ...`，Corpus也直接执行`node scripts/corpus.mjs [T06]`；均非手工模拟命令结果。
- 相关DB集成：NOT_RUN（隔离未证明），新增数据库记录0；不把跳过计为PASS。
- 两份PPT的`validatePptx`检查CRC、部件、关系、页数、16:9；`assertTextFit`检查全部文本框。
- 独立`inspect_presentation_package_integrity.py FILE --fail-on-findings`：5/10页各PASS，finding_count=0。
- 独立`inspect_presentation_layout_geometry.py FILE --expected-slide-count N --expected-aspect 16:9 --validate-heading-fit --fail-on-findings`：各PASS，findings/warnings均0。工具来自Presentations技能container_tools；结构不代表原生软件兼容性已人工验收。
- Artifact Tool导入并渲染全部15页，逐页1280×720检查中文、表格、引文、页脚、标题：未见明显缺字、溢出、遮挡。5页第3页与10页第8页web内容是冻结MOCK，不是本轮实时版本结论。
- 初次视觉导入因Playwright清空test-results而找不到产物；重跑Corpus恢复产物后导入通过。没有丢失业务文件，也没有改布局来绕过检查。
- `git diff --check`及提交文件检查：PASS；.acceptance和test-results仍忽略，仅合成PDF入库，无PPTX/日志/凭据入库。

本地留存（均是STUB规划的真实PPTX）：

| 文件 | 页数 | SHA-256 |
| --- | --- | --- |
| test-results/corpus-v1/management-5.pptx | 5 | 92c41cbb620cf62575f0dacdf76dd7a11d01944d4df334c8862b37fbba8cd9d4 |
| test-results/corpus-v1/management-10.pptx | 10 | 1adaf6266fd869f2a5530c56d77803c079a1603fe625b28ba0b0d47feb3a5b86 |

渲染图为同目录render-5/render-10/slide-N.png，SHA对应的逐页图已看。人工原生检查清单见Corpus README，明确NOT_RUN。旧Phase8四份文件未重生成、未上传/覆盖/删除。

## 尚待授权的真实验收与预算草案

前提首先是独立测试库与私有Storage余量确认，且不执行DDL或修改生产。否则即使批准API费用也不执行有污染风险的写入。当前本轮DeepSeek/Embedding/Tavily/邮件各0；仅访问公开定价文档，无业务服务请求或费用。

建议下一轮上限（包含后台记忆提取等隐式调用；失败尝试也计数）：

| 类型 | 上限 | 用途 |
| --- | --- | --- |
| DeepSeek | 24次 | 多轮/无证据与有证据问答、会议、记忆提取/召回、搜索答案、2份PPT规划；不自动补足失败调用 |
| Embedding | 16次 | 3份PDF索引、RAG、记忆写入/检索、PPT来源检索；每次批量有界 |
| Tavily Basic | 2次 | auto时效查询和required查询，off/普通知识验证0调用；不对PPT重复搜索，若现有流程不能复用已验收证据则停止调整计划 |
| PPT | 2份 | 同场景5页、10页；不当作第五份Phase8业务文件，不触及原四份 |
| 邮件 | 0 | 仅草稿/版本确认，不启用发送 |

2026-11-05公开官方定价复核：[DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/) Flash峰值未缓存输入$0.30/M、输出$1.20/M；旧v4-flash名称映射到Flash。现有配置是否仍为该供应商/型号未读取，**不擅自换模型**。上限每请求输入40,000 tokens、输出8,192 tokens，24次约$0.524；按预算换算10元/美元（保守假设，不是实时汇率）约¥5.24。[Tavily](https://docs.tavily.com/documentation/api-credits) Basic1credit/次、按$0.008/credit保守计2次约¥0.16；合计约¥5.40，建议总预算上限**¥6**。

[SiliconFlow定价](https://www.siliconflow.cn/pricing)公开页此次未提供可可靠核算的具体Embedding型号费率；未查账户当前模型/额度。故¥5.40是**Embedding确认免费且Storage余量足够时的条件估算**，不是已满足完整费用前置检查。授权后仍须先核实当前供应商/型号/余量；Embedding非免费、型号不同或无法可靠计量时停止并重新报价，绝不沿用假定费率执行。输入/输出/尝试次数必须在调用前计入预算，任何单项或总预算预计超限即停。此草案尚未获得授权。

停止条件：DB隔离/Storage余量未证实；模型费率/用量缺失；429/额度不足；超时或中断后可能重复扣费；资料检索错误；任务/文件状态不一致；任何非预期模型/搜索/邮件出站。禁止静默重试、自动充值/升级/换供应商，保留最小脱敏诊断，剩余项NOT_RUN。

历史Phase3/4/5/7/8真实记录可复用为集成曾可用、存储/鉴权/恢复机制曾通过的佐证；Phase6真实收件可作为邮件能力历史证据，不重发。但同一新Corpus的语义/冲突/刷新/重启与实时搜索、真实PPT仍需要该轮实际执行记录。

## 剩余风险与停止状态

- 阻塞本轮综合正式通过：测试库全链路隔离未证明；真实服务待授权/费率及余量核实；同场景历史/任务/文件重启恢复未跑；新Corpus PPT未原生打开。
- 观察项：Phase3偶发上传HTTP500仍未复现，按用户要求仅观察，不开展专项；历史DB连接超时在实际复发时排查。
- 已知边界：RAG仍是证据摘录；风险等级/自由分析的语义真实性无法靠Zod证明；PPT官方机构支持仍按现有任务策略，未知机构失败关闭；进程内限额非账单硬上限。
- 测试仅用合成配置，EMAIL_DELIVERY_ENABLED=false；未启动加载真实配置的Worker、未改邮件配置/发送、未访问生产或推送/部署。此前真实配置关闭状态沿用用户确认，本轮不声称重新读取生产环境验证。
- 无新增产品功能、无架构升级、无Schema改动。完成本地提交后停止等待审查，不自动发起真实业务调用或公网回归。
