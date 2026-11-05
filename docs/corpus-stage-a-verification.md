# Corpus Stage A — 共享Supabase受控集成验收

2026-11-05。依据用户最新授权复用现有Supabase，不创建本地PostgreSQL/Docker，不要求多租户隔离。此前“共库不能运行”的停止条件已由此次受控写入授权取代，但不授权操作既有数据或真实外部服务。

## 结论与证据层级

首轮 **T01–T08全部PASS（8项）**：真实PostgreSQL，模型/Embedding/搜索/邮件均为STUB，Storage为本地持久化替身。不能称为Live E2E或Supabase Storage真实验收。
重复请求、Worker空队列/并发领取、PPT恢复/重复发布在首轮通过。额外独立Run的T01复跑未完成：一次测试hook超时，一次预检失败；随后只读SELECT 1确认CONNECTION_TIMEOUT，停止追加数据库调用。不将这些失败套件/未执行案例算作PASS，也不计算掺入NOT_RUN的“总通过率”。

本轮仅新增测试、工具和文档，没有改业务实现/接口/Schema/依赖/真实配置；无迁移/DDL/删改既有记录、无云Storage操作/付费服务/邮件/Push/部署。

## Run与Manifest

所有Manifest在Git忽略目录 `.acceptance/corpus-stage-a/<RunID>/manifest.json`。包含创建时间、预分配根ID、实际观测的各表ID/精确外键与JSON来源关系、数量、Scope、Storage标识/SHA、旧记录ID/哈希基线、案例结果、保留/清理状态。预分配root不等于已创建记录；清理候选仅来自实际inventory，不从模糊名称认领。

| Run ID | 创建时间（北京时间） | 结果 | 新增数据库记录 |
| --- | --- | --- | --- |
| 49badde9-63d3-4963-8ce1-4d5bef94b047 | 2026-11-05 22:54:43 | T01–T08 PASS；既有记录哈希变化0 | 59 |
| b7b11145-fc6c-4724-80b3-1def9f95d5dd | 2026-11-05 23:02:47 | 额外T01复跑：30秒beforeAll hook超时，案例未执行 | 0 |
| 530ed1c6-5d54-4d9b-b4c9-02d5742a43cf | 2026-11-05 23:08:09 | 额外T01复跑：预检CHECK_FAILED，案例未执行 | 0 |

后两次0写入由执行路径确认（仅前置SELECT与本地Manifest，未进入任何业务it）；因后续连接超时，未再用独立云端查询复核其预分配ID。其inventory为空不是额外SQL复核的证明。新加`corpus-db-audit.ts`可在连接恢复且获准时按精确roots/Scope只读补齐，不自动启动。

首轮实际新增数量与关系：

| 表 | 数量 | 精确归属 |
| --- | --- | --- |
| conversations | 3 | Manifest预分配UUID；CORPUS-STUB+Run ID标题 |
| messages | 28 | 仅3个conversation_id；有意保留失败/中断消息 |
| documents | 3 | 预分配UUID；唯一假Storage origin、bucket、Embedding Space |
| document_chunks | 6 | 精确document_id；实际解析3PDF共6页 |
| meetings | 2 | 预分配UUID；原始Corpus加第12行Run ID/场景，sha唯一 |
| meeting_analyses | 2 | 同一测试会议两版；第二会议失败无分析 |
| meeting_risks / risk_evidence | 2 / 2 | analysis→meeting、evidence→risk |
| meeting_todos | 3 | 2条行动+1条风险跟进，重分析不重复建待办 |
| email_drafts / email_draft_confirmations | 1 / 1 | 仅本轮meeting/draft、精确版本确认，不发送 |
| memory_jobs / memories | 2 / 3 | 唯一Run Scope，source message/parent conversation关联 |
| presentation_jobs | 1 | 唯一Run Scope，本轮assistant message/conversation；原版本+一次修订journal |
| email_deliveries | 0 | 不实例化邮件Provider、不排队发送 |

总数59。Storage替身对象7个：3 PDF、2 TXT、2份同一5页PPT任务的原版/修订版。实际文件在该Run目录objects下，Manifest记录key/size/SHA，明确`backend=LOCAL_STUB, cloudObject=false`。**云端Supabase Storage新增0**，不冒称这些对象能通过真实公网下载。原Phase8四业务PPT未改变。

## 安全边界

- 不启动buildApp/server或后台轮询，不加载真实供应商适配器。测试显式构造STUB，fetch出站即报错；重启子进程只做SELECT与本地STUB读取。
- PDF/会议Worker的claim和过期回收均由唯一origin/bucket限定，PDF另有唯一Embedding Space；记忆/PPT由唯一Scope限定。预检检查其原先为空，防止Scope误接旧数据。
- 公开Railway Worker使用真实Storage origin或原Scope，不会领取本轮假origin/独立Scope任务；本地测试Worker只能领取该Run任务。聊天历史只操作本轮conversationId；检索只查本轮Embedding Space；会议分析/人工编辑/确认均为精确本轮ID。
- 会话/PDF/会议列表仍全局可见，**不声称UI隔离**。用户本次已允许共享库可追踪的合成记录；文件名/标题显式STUB+Run ID，不伪装真实业务。
- 测试前后对15张相关表的既有ID做服务端md5(row JSON)比较，仅哈希离开数据库，未读取旧内容。首轮变化0；这证明检查窗口内未观察到变化，不保证之后其他公网用户不会写入。若并发外部变更导致差异，只报告并停止，不恢复/覆盖旧值。
- 仅本轮新建ID上模拟lease过期、状态失败、人工编辑和版本修订；没有整表UPDATE/清理。新测试不调用历史清理脚本。
- Manifest先保存预分配roots，后每Case按精确关系收集自动生成ID；Storage对象写前登记，本地文件`wx`禁止覆盖；Manifest使用临时文件+rename原子发布。失败停止后续Case，保留数据供审查。
- 新runner复用现有redact-output，遮盖数据库连接串/密码、Cookie/Auth；不向控制台转发重启子进程原始错误。仅数据库字段进入测试配置，不从环境创建真实供应商实例。EMAIL_DELIVERY_ENABLED=true时拒绝测试配置；已单独验证关闭守卫通过。没有改.env或Railway配置。

## 案例结果

| ID | 层级 / 真实依赖 | 结果 | 实际通过的断言与边界 |
| --- | --- | --- | --- |
| T01 | Integration / PostgreSQL，模型STUB | PASS | 多轮、两个会话、独立连接历史；同clientRequestId不重复；失败消息持久化与仅本轮中断恢复。非真实LLM上下文理解 |
| T02 | Integration / PostgreSQL+PDF.js，Embedding/Storage/选择器STUB | PASS | 3份2页PDF处理→ready、6chunk；向量按唯一Space检索，code/page/documentId和引用保存。上传HTTP/UI未在此测 |
| T03 | Integration / PostgreSQL，模型STUB | PASS | 有检索但无证据选择，拒答文本及空引用持久化。非真实模型无证据识别能力证明 |
| T04 | Integration / PostgreSQL，会议分析STUB | PASS | 风险/证据/待办/草稿事务；人工林岚/2026-11-09/进行中重分析后保留；两分析版本、确认不发送、旧来源确认拒绝；非法JSON失败无部分分析 |
| T05 | Integration / PostgreSQL，提取/Embedding STUB | PASS | 3事实、sourceId/parentId关联，队列完成与空队列幂等；另一会话经真实检索保存3记忆引用。非真实语义提取 |
| T06 | Integration / PostgreSQL，模型/搜索STUB | PASS | required/auto各1次替身搜索；off/普通auto不搜；官方URL与冻结查询/发布时间JSONB保存；搜索失败落failed，无引用。冻结时间不是真查询时间 |
| T07 | Integration / PostgreSQL，模型/搜索STUB | PASS | 原始改期提议与已存决策分别保留；新官方版本冲突结论/两来源落库。非模型跨源推理Live证明 |
| T08 | Integration / PostgreSQL+PptxGenJS，规划/Storage STUB | PASS | 5页任务入队去重、双连接并发只规划/上传一次；按保存plan恢复且不再调用规划；旧版本保留，修订事务发布/重复请求幂等；独立进程重启恢复与服务层下载SHA验证。10页在既有Corpus离线通过，本轮DB只测5页；无真实Storage/HTTP/原生打开证明 |

首轮独立进程receipt：restored=true、pptDownloads=1、externalCalls=0。不是完整API进程/浏览器重启E2E。HTTP下载权限沿用已通过的单元/生产E2E证据，本轮DB套件不重复宣称HTTP鉴权验收。

## 执行命令与异常

```powershell
$env:CORPUS_SHARED_DB_AUTHORIZED='1'
npm run test:corpus:db           # 首轮8通过，329.02秒
npm run test:corpus:db -- T01    # 两次复跑均停在预检，0案例执行
node --import tsx scripts/corpus-cleanup-dry-run.ts 49badde9-63d3-4963-8ce1-4d5bef94b047
npm run check
npm run test
```

实际Windows调用npm时使用等价Node npm-cli.js入口，DB运行器直接`node scripts/corpus-db.mjs [T01]`。

- `npm run check`：181测试/17文件、类型与双生产构建PASS；单独`npm run test`181 PASS。
- 新增restart/dry-run/audit脚本另以TypeScript `--ignoreConfig --noEmit --strict --module NodeNext --target ES2022 --skipLibCheck`检查PASS。
- Stage A后未改业务/前端，不重复生产E2E；沿用41f3ea9已执行的生产Chrome E2E1项和smoke，明确为历史离线证据。
- 首轮集成8项PASS。额外复跑1因默认beforeAll 30秒超时，改**仅此套件**前后hook为120秒；连接池max5、连接5秒/SQL15秒上限与业务策略不变，不新增重试。曾尝试批量只读前置检查，最终保留首轮逐表核查方式，不增加共享库并行连接压力。
- 额外复跑2预检CHECK_FAILED，未进入业务Case；随后独立只读SELECT1明确CONNECTION_TIMEOUT，停止所有追加数据库操作。没有把历史连接问题扩展为专项研究或框架修复。
- 首次独立脚本类型检查需TS7的`--ignoreConfig`；补充后发现CLI Run ID字符串类型与randomUUID模板字面类型不兼容，收窄工具参数为已由UUID格式检查的string，类型检查通过。没有数据库结构变化。
- 全部本地Manifest原子保存校验PASS；它是文件操作，不被计为数据库连接恢复。
- 首轮后增加本地Storage相同字节幂等/不同字节拒绝覆盖保护，使用已保留文件离线复核PASS、仍7对象；两版本PPT的待办表XML均为人工林岚/2026-11-09，记录artifact-content-receipt.json。没有为此重新渲染或云上传。
- 首轮后仅调整测试追踪、失败诊断、hook和离线文件断言；业务SQL/选择边界未改。因连接不可用，最终测试工具版本未再次完成整套云端复跑，不用首轮8PASS掩盖这项限制。
- 最终Corpus确定性17项及`git diff --check`通过。默认`test`不载入本轮DB测试，不会自动连接Supabase或调用外部服务。

## 只读清理计划与保留

首轮已实际运行Dry Run，59拟候选记录、外部结构化引用0、缺失0、executedDeletes=0；状态WAITING_STAGE_B_AND_SEPARATE_DELETE_APPROVAL。计划位于该Run目录cleanup-dry-run.json。它采用BEGIN READ ONLY，按精确UUID和对象key扫描15表FK/嵌套JSON关联；列出删除先后关系但**没有删除代码**。7个对象均为本地STUB，云Storage删除候选为空。

全部数据/文件保留。此Dry Run在Stage B之前，只是当前快照，**不授权删除**；人工结束后须补齐Stage B精确ID、重新核查所有引用/任务及自由文本中可能的依赖，再另行确认。不要复用旧计划直接执行，更不能按名称清理。
`corpus-db-audit.ts <RunID>`仅精确读取并更新本地Manifest，供中断后的追踪核对；连接恢复后再由授权步骤运行，不自动补测。

## Stage B交接

准备Run ID `cee51f13-79e6-42d6-9caa-dc21b81cf079`，目录`.acceptance/corpus-stage-b/<RunID>`，包含带Run ID的3PDF副本、会议TXT、可复制输入和空的人工ID/结果登记模板；数据库写入0。材料来自同一Corpus，不另造项目。
详细操作位置、输入、预期、证据/通过标准、原生PPT检查和停止条件见[人工指南](corpus-stage-b-manual.md)。手工流程及真实DeepSeek/Embedding/Tavily/Storage/PPT均NOT_RUN / WAITING_AUTHORIZATION，不能以本轮STUB替代。

按默认人工步骤预计最少约14模型、约8Embedding、通常2次Basic、1份10页PPT、0邮件；建议待审批上限改为20模型/12Embedding/2Basic/1PPT/¥6。约¥4.53条件估算与前置核价/余量要求见指南，不是假定Embedding免费或账户有余额。共享库两端Worker计量不明确时不能启动真实流程。自动化规则/异常/5页证据可复用，省去重复模型/搜索，但STUB内容不能复用成Live证据。

待办：额外独立Run复跑受连接超时阻塞；当前连接可用性未恢复证明；Stage B全流程、真实多源PPT、原生打开/布局和实际云文件鉴权/重启恢复由用户后续验收。Phase3偶发上传500仅观察。本轮停止等待人工，不自动启动本地真实Worker/公网回归或清理。
