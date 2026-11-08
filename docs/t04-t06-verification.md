# T04 关联记忆 / T06 内容驱动 PPT 修复验收

日期：2026-11-08。基线：`fa96881`。仅本地修复；尚未发布到 Railway。

## 结论与证据范围

| 项目 | 结果 | 实际证据 |
| --- | --- | --- |
| 原生产 11 条聊天记忆的关联查询、同名隔离 | PASS | 只读 PostgreSQL + 两次真实 DeepSeek 请求；存储行哈希未变 |
| 隔离 scope 聊天提取、跨会话/刷新/新连接池召回 | PASS | 真实 DeepSeek、BGE-M3、PostgreSQL；HTTP 聊天路由 |
| 会议分析事实进入记忆后召回决定/提议 | PASS | 原已验收分析只读；新 scope 的真实提取 Job + Embedding + DeepSeek |
| 原生产 scope 直接回答会议记忆问题 | NOT_RUN（成功验收） | 该 scope 没有会议记忆记录；只读查询实际正确拒答，不假装有证据 |
| 自动综合 PPT 两次独立生成 | PASS | 两次各 6 页，真实模型/私有 Storage/鉴权 HTTP 下载 |
| 固定 5/10 页、PDF-only、无附件 | PASS | 见下表，7 份最终文件共 41 页 |
| 原生 PowerPoint/WPS 打开 | NOT_RUN | 已完成 Artifact Tool 逐页渲染和包/版面校验，不能替代原生软件 |
| 新提交 Railway 公网复验 | NOT_RUN | 按用户要求不 Push、不部署 |
| 真实邮件/真实 Tavily 再验收 | NOT_RUN | 冻结的功能；本轮不注册发送或搜索 Worker |

## 根因

### T04：分别存在存储缺失、检索丢失和答案丢失

1. **存储缺失**：只读初始快照有 11 条 ORCHID 相关记忆，全部来自聊天消息 `8be0e12c-47ab-4bdd-b88c-c27f9ca9e7d3`；8 个 `demo` 记忆 Job 均 ready、`analysis_id` 均为空。会议中的 11-20 决定/11-27 提议没有会议记忆 Job，不能将会议原文当成“已保存记忆”。现有正常生产入口 `meetings/service.ts:processOne` 在发布分析的同一事务中按传入 memoryScope 插入 Job；没有证据证明本次生产存在失败的会议记忆提取。不能从现存数据推断所有历史调用是否传入 scope。本轮不改会议分析，也不回填生产。
2. **检索缺失**：`memory/service.ts:retrieve` 原先在同来源展开前调用共享 `projectRelevant`。它要求项目编号和片段在同一句；存储的“总负责人是 Dr. Mira Qiao”“林岚于…在南京…”没有编号，被提前过滤。只展开最强的三个种子也可能丢失互补事实。另需区分问题中排除的项目与正向项目；不能把普通房间编号 Cedar-17 当成新项目而重置会议上下文。
3. **生成缺失**：`answerWithMemory` 原先只显示 `memory.content`（例如孤立人名/日期），丢失 `sources.evidence.quote` 已存的关系。显式要求仅根据记忆、但没有候选/选中项时，还可能落入普通模型路径。

修复链路：聊天/会议记忆提取 → 持久化（沿用现表）→ 词法/向量候选 → 同来源展开 → 以原文仅确定项目上下文 → 仅保留已存 quote 内事实 → DeepSeek 选择互补 ID → 发布已核对的存储证据及真实来源。

### T06：资料正确，覆盖/容量规则错误且默认页数确定过早

真实失败任务 `5fc3bba0-06ee-48f4-a0c7-08f232fc59dd`、`1873b00c-ddb1-4123-972c-a7c398c12cbc` 均保存了正确选择的 19 个来源快照，显式 5 页，没有丢 document IDs 或 meeting ID。

- `intent.ts:parsePresentationRequest` 原先在读取来源前用字符串长度/来源数决定默认 5 或 8 页，未区分自动与固定。
- `coverage.ts:requiredContent` 原先重复计入同一负责人的中英文引用，还将 `rag-owner.pdf | Page 2 | Synthetic test data only` 因文件名中的 owner 识别成负责人事实。实际 10 项“必需内容”包含重复与元数据。
- `coverageSlots` 原先每组三项、待办强制单独组页。9 项非待办占 3 个内容页，再加待办 1 页，超过固定 5 页仅有的 3 个内容页，模型请求前就失败。实际不存在“每条事实必须独占一页”，问题是错误需求数及待办隔离。
- `verifyContentQuality` 又强制待办纯表格页，阻止可读的同页混排。任务状态没有显示在现有待办正文中。

修复后先读取完整来源、去除元数据并合并同一负责人，再按必需事实/去重的补充证据/主题模式估算页数。技术范围 3–30、现有配置上限仍生效；固定页数不会静默改变。原样事实和当前待办可合并，每页最多三项，仍有文字可读容量检查。8 项有效必需内容可用 3 个内容页展示，因此原固定 5 页现在也能成功。

## 修改文件与作用

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| 记忆提取 | `apps/api/src/memory/extraction.ts` | 仅聊天提取请求启用 JSON、关闭 Thinking、显式 4096 输出上限；未改提取 Prompt/会议提取 |
| 检索关联 | `apps/api/src/memory/recall.ts`（新）、`memory/service.ts` | 正向/排除项目、同来源上下文、同名隔离、会议来源限制、互补候选和预算；不硬编码业务名称 |
| 回答/路由 | `memory/service.ts`、`apps/api/src/chat/service.ts` | 发布已存关系证据；显式 memory-only 不能借 PDF/Web/普通模型补齐，不将召回问题再提取为事实 |
| 意图/页数 | `presentations/intent.ts`、`presentations/coverage.ts`、`presentations/service.ts` | 自动/固定分离，先收集来源再确定持久化页数；已发布计划/文件不重写 |
| 覆盖/规划 | `presentations/coverage.ts`、`presentations/plan.ts` | 去重、元数据过滤、风险/待办同页、自动模式重复正文拒绝；完整引用与必要事实检查保留 |
| 一次显式重试 | `presentations/service.ts`、`presentations/plan.ts` | 未形成有效计划的校验失败可在现有一次重试中重新规划，提供位置/错误码反馈，保留 planningHistory；不自动无限调用 |
| 正文渲染 | `presentations/render.ts` | 纯表格四列（含状态），混排也显示最新负责人/日期/状态；动态行高，超限拒绝，不缩字/截断 |
| 必要前端参数 | `shared/presentations.ts`、`apps/web/src/PresentationPanel.tsx` | 可选 pageMode DTO；自动任务显示规划中、ready 显示实际页数；无样式/布局修改 |
| 测试 | `tests/unit/final-memory-ppt.test.ts`（新） | 通用 LYRA 数据覆盖项目上下文/反向隔离/证据边界、自动固定/容量、去重、混排实际 PPTX 正文 |
| 既有测试 | `tests/unit/ppt-v13.test.ts`、`tests/unit/presentations.test.ts`、`tests/integration/presentations.test.ts` | 默认页数期望更新；事务夹具保存真实隔离待办以满足现有来源版本校验，未弱化生产校验 |
| 真实验收 | `tests/acceptance-t04-t06-live.ts`（新） | 显式 opt-in、有界调用、私有 scope、原记录哈希对比、HTTP 下载/恢复检查 |

没有数据库 Schema/迁移、依赖、邮件、搜索、会议 Thinking 或 UI 布局变更。

## T04 真实结果

### 原有 11 条记忆直接只读验收

真实 DeepSeek 最终输出（保留原文，包括证据摘录的重复项）：

```text
根据历史来源（原文与观察时间见折叠引用）：
[M1] 林岚于2026-11-06在南京协调试点准备
[M2] 林岚于2026-11-06在南京协调试点准备
[M3] 总负责人是 Dr. Mira Qiao
```

实际来源均为原消息 `8be0e12c-47ab-4bdd-b88c-c27f9ca9e7d3` 第 1 行；记忆包含 `f14ada79-2fa5-4c8c-832c-a21e842d1b23`（日期）、`437c079d-f3f1-4c28-9b45-7057112a166f`（负责人）。答案不含 ORCHID-FIN 的苏州财务事项。反向真实输出：

```text
根据历史来源（原文与观察时间见折叠引用）：
[M1] 另一项目ORCHID-FIN的林岚负责财务
[M2] 地点苏州，时间2026-12-01
[M3] 地点苏州，时间2026-12-01
```

同样来自该原消息，含记忆 `acbb7436-d317-47d6-bf84-ffea4f27aae4`、`bfe4eac8-1415-464b-9863-925fdbddf5a2`；不含南京。原 scope 的会议问题返回“已保存的长期记忆中没有足够证据，无法确认。未使用PDF、会议原文或普通模型知识补齐。”且不调用模型补齐。全部原记忆哈希不变。

### 隔离范围的完整提取和跨会话验收

`final-ae1e8042-memory` 中，原聊天合成文本经真实 DeepSeek 提取 + BGE-M3 保存。另显式创建本轮会议记忆 Job，读取原已验收分析 `d5bcce0b-6b16-472e-8604-20e9cad5309a`（会议 `1069e81b-62e3-4705-a4dd-3e7f65c44fff`），只在新 scope 保存。没有重新分析/编辑原会议。两个 Job 均 ready，分别为 `039bfef3-8184-42ac-b8b5-d46e2a4a2560`、`fcad972d-2907-4e56-93d6-c33dd8bd12e6`。

HTTP 新会话查询、消息历史刷新和新数据库连接池检索通过。最终版本再次独立执行三次真实 DeepSeek 证据选择，会议问题原样回答：

```text
根据历史来源（原文与观察时间见折叠引用）：
[M1] 决策：保留2026-11-20试点目标，先核实依赖，不确认新的上线日期。
[M2] 提议将试点改为2026-11-27，尚未获批。
```

记忆 `3cc70ba7-2871-4c16-b7a6-e95e03bf8ec7`、`1a08c0dc-68a7-4132-961b-94f5d1bb0193`，均指向上述真实分析，证据分别为原文第 7/8 行。人物查询回答了 Dr. Mira Qiao、林岚、2026-11-06、南京；反向查询只回答苏州/财务/2026-12-01。保险保单编号缺失问题即使同时传入知识/必须搜索开关，也强制 memory-only 并正确拒答，无 PDF/Web 引用。

边界：证据仍采用摘录式输出，多个记忆可以显示相同证据句；未实现自由综合或知识图谱。源原文只供上下文关联，发布的事实必须是存储 quote 的子串；不能因此将未提取的会议资料变成答案。

## T06 真实结果

复用已存在的三份合成 PDF 和原已验收会议，19 个来源快照；使用当前有效人工待办 `林岚 / 2026-11-09 / in_progress`。原 PDF/会议/记忆/旧失败 PPT 行快照哈希在最终运行后保持不变。

| 用例 | 实际页数 | 最终任务 | 结果 |
| --- | --- | --- | --- |
| 自动 PDF+会议，第 1 次 | 6 | `97ae2539-500e-422b-929b-03bb6c072aaa` | PASS，使用一次显式修正规划 |
| 自动 PDF+会议，第 2 次 | 6 | `9c08320f-5b9b-4dee-a7b6-1f6eff33a3a3` | PASS，首次模型输出通过 |
| 明确 5 页普通培训 | 5 | `bc7b76ce-ec46-46c8-bb07-82c238b69273` | PASS |
| 无附件、自动培训 | 5 | `f1d2dd76-bfb5-40bb-829a-f52b0d82f367` | PASS |
| PDF-only、自动 | 4 | `c7bfb418-5300-4892-9405-4b763bd625eb` | PASS |
| 明确 5 页综合 | 5 | `ef1edaac-d0ab-49a1-a681-b50ff7cef75c` | PASS，待办和建议同页可读 |
| 明确 10 页综合（最终重验文件） | 10 | `48e99541-3a90-4cee-a966-b944bc0b4243` | PASS，严格 10 页 |
| 明确 3 页且容不下必需内容 | 3（无文件） | `0524f433-1b70-4f6c-913e-e8bff8926d2e` | PASS：预期拒绝，0 次模型请求 |

自动两份均按以下六页呈现：封面；执行摘要（ORCHID-7421 / Dr. Mira Qiao / AMBER-593）；风险与问题（未交付风险、11-20 目标、11-27 尚未获批）；待办及负责人（林岚 / 11-09 / 进行中，另一个未知负责人/日期待办如实显示）；建议与下一步（区分分析/建议）；参考资料。没有重复页、空白页或编造完成进度。正文为可核对的中英文原文摘录，未假装提供全文翻译。

固定 5 页综合：封面、执行摘要、风险与问题、建议与下一步（含两项当前待办及建议）、参考资料。固定 10 页：封面、执行摘要、风险与问题、待办及负责人、背景/范围、证据边界/待批提议、条件目标/分析、行动建议、风险跟进、参考资料。固定 10 页后半段复用模板“背景与目标”标题，内容不同；标题命名仍较简单。

完整事实出现在实际 slide XML 正文，非仅备注/来源列表；人工状态显示“进行中”。未批准提议明确标“来源提议（非正式决定）”，供应商风险未写成已确认延期。已有 ignored 过滤和当前待办版本校验保留。

7 份均完成真实私有 Storage 写入/读回、无认证下载 401、有认证 HTTP 200、ZIP/CRC/部件关系/slide 数量检查、刷新后重复下载 SHA256 一致。只读导入 Artifact Tool 渲染全部 41 页并逐页核对，无明显遮挡/裁切；额外结构与版面（16:9、页数、标题/项目符号几何）检查均返回 0。未重导出或替换真实下载文件。

三个关键文件 SHA256：

```text
auto-combined-1: 776d4c7c20ee6d3038ee022df24d67dc007ffebec763d8a3155e26eff047953e
auto-combined-2: 41aff07809a3558357e298da7659564c3e11ced9dafc75d0b850bc56c8fe57f6
fixed-10 final: 8ef4d76ca56d8e41e4e77d84e027359f260ef10e31aa2dab94b9bf4172911279
```

明确不足时的实际提示：“指定3页仅有1个内容页，8项去重后的必需内容至少需要3个内容页。请改用自动页数或增加页数；未删除事实。”

## 自动化与失败记录

| 执行 | 结果 | 证据层 |
| --- | --- | --- |
| `npm run check` | PASS：35 文件 / 278 项，类型检查、服务端和 Web 构建 | 默认不调用外部业务服务 |
| `npm run test:corpus` | PASS：17/17 | 真实解析/约束/渲染，外部服务明确 Stub |
| `RUN_LIVE_TESTS=1 npm run test:integration -- tests/integration/memory.test.ts tests/integration/presentations.test.ts` | PASS：14/14（记忆 4、PPT 10） | 真实 PostgreSQL 事务/锁/恢复，模型/Embedding/Storage Stub |
| `npm run test:e2e:production` | PASS：7/7 | 本地生产构建浏览器与 API，外部业务不冒充真实服务 |
| T04/T06 live HTTP 验收 | PASS | DeepSeek Flash、BGE-M3、PostgreSQL、私有 Storage 都真实 |
| 7 个最终 PPT 文件额外包/版面检查 | PASS | 文件读取；无模型、无存储写入 |

早期失败没有删除或视作成功：

- 会议记忆首次查询曾因 Cedar-17 被当作项目上下文而漏召回，修复通用标识识别后复验通过。
- 首份自动综合早期规划高估到 9 页，输出出现非法引用、重复提议、矛盾资料缺口/结构约束错误，被严格拒绝，没有上传半成品。对证据去重、容量估计和显式重试诊断进行修复后，该任务一次重新规划为 6 页成功；第二份独立任务首次输出通过。失败输出保留在 planningHistory，不无限重试。
- 数据库回归首次 10 项失败：旧 PPT 夹具使用不存在的待办 UUID，触发现有来源 guard；记忆语义探针的普通连字符词被误认项目。前者只修夹具为真实隔离行，后者修通用标识资格，不放宽业务校验。最终 14 项通过。
- 早期只读审计脚本曾因中间报告空列表未实际执行查询，随后加入恰好 3 项/3 次调用断言重新验证；空跑不计入成功证据。

多轮聊天、RAG 引用、会议人工编辑/邮件版本确认、搜索证据策略由默认/Corpus/API 回归覆盖；本轮没有再发送真实邮件、重新调用 Tavily 或将其他四功能的 Stub 当成真实复验。

## 隔离、复现与发布后复测

开始前只读队列：3 份 PDF ready；会议 ready 7 / failed 4；记忆 Job ready 8；PPT failed 2；没有进行中的生产任务。按用户确认保持 Railway 运行。测试仅手动泵 `final-ae1e8042-memory` / `final-ae1e8042-ppt`，不启动全应用生产 Worker，不领取 `demo` 队列。数据库事务测试使用随机 scope 与虚构 Storage origin。没有清理/删除原数据、覆盖原文件、执行 Schema 迁移或修改 Railway Variables。

本轮真实请求有次数/输出 token/预算上限。主验收报告累计 18 次模型请求、2 次 Embedding 批次；另最终隔离审计 3 次、原 11 条记忆只读审计 2 次模型请求；不足页数验证 0 次。没有无界重试。日志仅记录阶段、状态、用量和错误码，不输出凭据或认证头。

本地原始证据留在 Git 忽略的 `.acceptance/t04-t06-final/`：`before.json`（只读现场快照）、`final-ae1e8042/report.json`（来源/大纲/文件/用量/哈希）、`original-memory-audit.json`、`final-memory-audit.json`、`capacity-negative.json`、对应 `render-*` 逐页图和文件检查报告。未将运行数据、Cookie、密钥或 PPT 二进制提交到仓库。

`tests/acceptance-t04-t06-live.ts` 是本次事故现场的显式付费验收入口，依赖上述已审查的 `before.json` 现场快照和授权的根 `.env`，不是普通测试/自动 seed。只在重新确认共享数据库状态与授权后运行 `RUN_FINAL_LIVE=1 node --import tsx tests/acceptance-t04-t06-live.ts`；不要把空数据库缺少现场快照解释为通过。常规固定测试可直接 `npm run check` / `npm run test:corpus` 复现。

不需要为本轮修改 Railway Variables。由维护者决定发布后，按以下顺序公网复测：

1. 确认部署的是本轮提交，正常 Worker 的记忆 scope 与查询 scope 一致。
2. 先对现有聊天记忆提出上述人物/时间/地点和反向同名问题。缺失的会议记忆需通过正常“重新分析会议”入口产生 Job，等待 ready；不能期待本轮隔离 scope 在生产自动可见。该生产重分析本轮未执行，也未改现有人工作品。
3. 新建对话，仅根据已保存会议记忆查询 11-20/11-27，检查折叠来源第 7/8 行及未批准状态。
4. 选择 Demo PDF 和当前会议，使用“按内容自动决定页数”指令；检查实际页数、关键事实、林岚/11-09/进行中，下载并刷新再下载。
5. 再测明确 5/10 页；用原生 PowerPoint/WPS 打开最终文件。邮件发送不属于此轮复测。

当前交付仅本地提交，工作区检查后停止，等待用户最终公网 T04/T06 验收。
