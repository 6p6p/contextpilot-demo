# MVP 最终功能收尾：公开搜索与 Cookie 检查

日期：2026-11-06。范围仅限公开问答和测试日志保护。PPT 已由用户确认可用并冻结；本轮未修改生成器、规划器、前端、数据库或邮件流程，未重新生成 PPT。旧报告中的失败和 NOT_RUN 保留为当时记录，不追溯改写。无迁移、云端配置变更、数据清理、Push 或部署。

## 公开回答路径

之前的正常路径已在 v1.3.2 改为自然回答，但仍有版本领域提示、规则排序，以及没有给模型提供 URL 的残留。当前路径：

- 普通公开知识：DeepSeek 直接回答，无强制搜索、Claim/Quote 或二次审核。
- 实时公开问题：Tavily Basic → 有界标题/摘要或正文/真实 URL/发布时间（可空）/查询时间 → 一次 DeepSeek 自然归纳 → 服务端持久化来源与查询时间。
- `off` 不调用 Tavily；`required` 执行真实检索；`auto` 仍用既有时效意图。最新问题关闭联网时明确提示未核实。失败不回退成伪装的最新答案；仅首轮零结果时允许一次补搜。
- 正常公开路径不调用 Claim Schema、Quote 索引、逐字匹配、版本冲突门禁或二次 LLM 审计。旧 `answerWithSearch`/synthesis/evidence 审计代码及 Corpus 预期保留，仅供原有离线审计和既有调用；不是聊天公开回答的门禁。
- 去重只合并同 URL（忽略锚点）且摘要相同的结果。机构域名使用既有任务识别；未知机构不因域名表缺项把所有结果过滤掉，没有新增 Node.js 版本特例。保留已有隐私短查询检查、协议/响应大小/次数/超时边界。
- 模型可以自然概括；只有明确支持的状态才作为确定结论。未明示的阶段或批准状态不能按惯例补全。这是通用生成提示，不增加答案事后审计。
- 模型正文中的链接移除；网页卡片和默认最多三个链接来自实际 provider 结果。沿用已有折叠详情和历史 JSONB，无 UI/Schema 变更。

内部 PDF/会议/记忆/PPT 校验不变。修复混合 PDF 与公开查询时原先静默忽略公开部分的问题：只提取当前用户明确写出的 `；联网查询……` 等独立公共子句，经敏感检查后发给 Tavily；RAG 原问题仍交原知识库接口，结果标明内部/公开来源。没有安全独立子句时提示改写，不把 RAG 文本、会议、记忆或聊天历史拼进公开查询。普通公共搜索同样只接收当前问题，不发送历史上下文。敏感词检查是保守边界，不是任意敏感信息的完美识别器。

## 真实服务复测

Run：`fff290e0-e996-4475-912f-e2d38a45c6a8`。Chrome request → 本地真实 Fastify 聊天/鉴权 → PostgreSQL/DeepSeek/Tavily；独立临时 Demo 签名键，仅监听 127.0.0.1。不启动 Worker、Embedding、PPT、邮件或 Storage。它不是完整生产 UI Live E2E，UI 用独立生产模式 fixture E2E 验证。

问题：**请联网查询 Node.js 当前的 Active LTS 和 Maintenance LTS 版本，简要说明区别，并提供官方来源及查询时间。**

| 场景 | 真实结果 | 限制 |
| --- | --- | --- |
| 什么是向量数据库？auto | PASS：DeepSeek 直接解释向量、相似度检索及用途；无 Tavily | 普通公开问答 |
| required 首轮 | 链路 PASS；阶段准确性 FAIL | 自然回答先断言 v26 Active、v24/v22 Maintenance，随后承认按顺序推断；不能算已核实 |
| auto 首轮 | 链路 PASS；阶段准确性 FAIL | 检索成功但同样推断阶段；保留原回答 |
| off | PASS：无模型/搜索调用，明确联网关闭 | 没有假装核实最新版本 |
| 通用提示修正后的 required | 自然问答/不确定性处理 PASS；精确阶段结论 UNCONFIRMED | 未再猜测阶段；没有 Schema/冲突拒绝错误 |
| 来源/时间/恢复 | PASS | 三次联网的全部 URL 均与对应 Tavily 原始结果逐一比对；发布时间均为空，未补造；查询时间落在消息创建/完成之间；匿名历史请求 401 |

最终实际回答全文（不是 HTTP 200 摘要）：

> 按本次查询（2026-11-06）的 Node.js 官方版本页，v24 和 v22 均标为“LTS”，但页面没有区分 Active LTS 与 Maintenance LTS，因此无法仅据所给资料确定哪一个是 Active、哪一个是 Maintenance。资料也未给出这两个分支各自的最新小版本号，不能补全。
>
> 区别：官方说明 LTS 通常保证关键错误在共 30 个月内被修复；生产应用只应使用 Active LTS 或 Maintenance LTS。资料未明确两类 LTS 在维护内容上的具体差异，不能据此展开。
>
> 官方来源：Node.js 官网“版本/Releases”页（nodejs.org/zh-cn/about/releases 及 previous-releases）。查询时间：2026-11-06。网页无发布时间及更新时间，且不同页面（含 v26、v27 状态）表述不一致，故上述结论仅限该查询时点所见页面。
>
> 查询时间：2026-11-06T08:52:59.926Z

实际来源包含 [版本历史](https://nodejs.org/zh-cn/about/previous-releases)、[版本状态](https://nodejs.org/zh-cn/about/releases)、[下载版本](https://nodejs.org/zh-cn/download/releases)。共五条官方 URL，详细快照仅在本地忽略目录。检索仍有不同缓存版本/阶段信息不足，**本轮没有证明当前 Active/Maintenance 精确归属，也没有将不确定性冒充任务完整完成**。按用户本轮设计允许自然报告证据不足，不再继续开发 Claim 审核或进行无界调用。

四场景先完成一次进程重启恢复；最后的补充回答另一次重启后按消息 ID 核验内容、来源、状态完全一致。补充测试驱动曾将 POST 返回的本次两条消息与完整四条历史直接比较而断言失败；已修正为同 ID 比较，以只读请求复核成功，没有再次付费生成、修改回答或改写历史来通过。

调用 **DeepSeek 4 次、Tavily Basic 3 次（各 1 credit）、Embedding/Resend/Storage 0**。输入 11,847、输出 972 tokens；无第二模型审计。执行前余额/用量接口可读，Researcher 额度 1000、已用 25，未升级/充值。硬上限 4/4、¥2，遇到不可核算或上游失败停止；最终调用已停止。依据 [DeepSeek 官方价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) 和 [Tavily Basic 计费](https://docs.tavily.com/documentation/api-credits)，用保守 ¥3/百万输入、¥12/百万输出和 ¥0.08/Basic 估算 **≤¥0.288**，总请求预留上界 ¥0.472；不是实际账单。

## Cookie 风险结论与处置

**事项未关闭：无法证明历史泄露 Cookie 与正常实例隔离。** 检查 `demo/access.ts`：HMAC-SHA256 签署 `demo:expiry.nonce`，密钥为显式 `DEMO_ACCESS_KEY`，缺省回退 `PPT_ACCESS_KEY`。Cookie 最多 8 小时；没有域名、Scope 绑定或服务端会话撤销表。HttpOnly/SameSite/Secure 和浏览器 host-only 限制不能阻止已复制 Cookie 被同键实例接受；退出登录只清浏览器 Cookie。

历史出错驱动曾加载根配置，没有保留历史密钥指纹，不能证明当时使用独立临时键。当前本地键来源为 `DEMO_ACCESS_KEY`；本轮临时键经运行时比较确认与当前正常键不同，但这不能追溯证明旧 Cookie 安全。未找到 Railway CLI/连接器，未读取/修改生产配置，**Railway 与历史密钥是否相同仍无法核实**。

已知泄露 Cookie 的过期时间为 **2026-11-06 14:22:15.460 UTC / 北京时间 22:22:15.460**。08:55 UTC 检查时尚未过期；签名键未轮换时，只能在服务器到达其过期时间后确认该 Cookie 自然失效。本报告不保存 Cookie、nonce 或签名，不宣称已全局注销。

需要用户在下一部署阶段处理（本轮不操作）：

1. 本地 `.env` 设置新的随机 `DEMO_ACCESS_KEY`，与生产使用不同值，重启本地进程；不要将值写入日志、报告或 Git。若旧安装只配置 PPT 键，新增显式 Demo 键即可改变 Demo 签名，不需修改冻结的 PPT 引擎或文件。
2. Railway `perceptive-spirit` Variables 核实并轮换 `DEMO_ACCESS_KEY` 为新的独立值。会使全部既有 Demo 登录失效，用户需要重新登录；保存变量可能引起服务重启/部署，须由用户在后续授权阶段操作。未发现模型/数据库/Storage 密钥泄露证据，不要求无关密钥轮换。
3. 用受控旧会话验证轮换后受保护 API 返回 401、新登录成功。不要再次粘贴泄露 Cookie；生产检查 NOT_RUN，不能用合成测试代替。

日志保护：正式 API 已省略请求头序列化并 redact Cookie/Authorization/Set-Cookie；E2E 使用逐行脱敏输出。本轮扩展脚本脱敏到 JSON/env/query 的 key/token/secret/password 字段，回归使用纯合成值，覆盖凭据、认证头和 Cookie。新验收驱动捕获失败仅输出安全阶段信息，不打印完整异常请求对象，不保存 Playwright traces/Cookie 文件；原失败记录不再复制。不能保证任意第三方脚本完全没有泄露，应统一使用现有输出包装器。

## 自动化、数据与冻结边界

| 层级 | 命令/执行方式 | 结果 |
| --- | --- | --- |
| Unit/API/build | `npm run check`（含 `npm test`） | 258/258 PASS，类型检查、API/Web 构建 PASS |
| 固定 Corpus | `npm run test:corpus` | 17/17 PASS，Golden 未修改；旧 Claim 用例只是离线审计 |
| 真实 PostgreSQL + 所有外部 STUB | `node .acceptance/final-db.mjs`，调用 `vitest run --config vitest.integration.config.ts tests/integration/corpus.test.ts -t T0[1-7]` | T01–T07：7 PASS；T08、M01–M04：5 NOT_RUN，未计入通过分母 |
| 生产构建/真实浏览器 API 边界 + 业务 UI fixtures | `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e:production` | 4/4 PASS，13.4 秒；含 PPT 附件、进度、失败、历史下载、会议草稿入口/确认、Markdown/会话/PDF 管理 |
| 新真实 PPT/PowerPoint/WPS | 按本轮冻结要求不执行 | NOT_RUN，不改变用户已经确认的 PPT 验收状态 |

DB Run `3cf6c9f5-bbc4-4881-90a7-bbb4a6b12b24`：65 条新合成记录，会话 4、消息 32、PDF 3、chunk 6、会议 2、分析 2、风险 2、风险证据 2、待办 3、草稿 1、确认 1、记忆任务 4、记忆 3；PPT 任务/发送记录 0。5 个本地替身对象、云 Storage 0。既有记录基线变化 **0**。后台任务限定独立 Scope/假 Storage 身份，不启动共享 Worker；无清理。

Live Run 新增会话 4、消息 10，其余业务对象/任务/Storage 0；预登记 UUID，全部保留。新消息历史恢复的读取会进入原有过期任务检查，但本轮没有 processing 消息，未执行恢复性改写。两 Run 的精确 ID、关系及快照保存在 `.acceptance/corpus-stage-a/<Run ID>/manifest.json` 和 `.acceptance/final-closeout/manifest.json`，不提交 Git。

新增 5 项固定测试覆盖自然回答输入元数据/一次模型调用、敏感查询/失败边界、混合问题公开子句、同键跨实例/轮换/过期、日志脱敏；真实 DB T06 增加混合 RAG/搜索边界持久化断言。PDF/会议/记忆/人工待办/草稿确认原有回归通过；PPT 在既有单元/结构/权限/生产 UI 回归中覆盖，本轮未增加真实 PPT 验收。邮件始终关闭，实际发送 0。Phase 3 偶发上传 HTTP 500 保留观察项。

剩余：精确实时 LTS 阶段未核实；历史 Cookie 生产键共用情况未知、轮换/生产验证待用户处理。完成本轮收尾后停止，不继续扩展 MVP。
