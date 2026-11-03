# Phase 5 前置工程审查

状态：前置隔离修复已验证；长期记忆尚未实现，不得标记 Phase 5 验收通过。基线为用户接受的 ccc3c53。按功能里程碑推进。

## Phase 4 遗留问题

### P1：过期清理跨环境修改任务状态（已最小修复）

会议与 PDF 的 processOne 原先在领取前全表清理 uploaded/processing 过期任务，没有采用领取时的配置过滤。真实数据库/外部替身测试也会运行该逻辑，因此不同 Storage 环境的任务可能被误标 failed；没有证据证明历史上实际发生过数据损坏。

修改 apps/api/src/meetings/service.ts、apps/api/src/knowledge/service.ts：清理条件与领取边界一致，会议按 storageOrigin/storageBucket，PDF 另按 embeddingSpace。无 schema、依赖或框架变更，无迁移。

### 任务原子性与重复执行边界

两个 service 均在事务内 SELECT FOR UPDATE SKIP LOCKED 后更新状态和随机 leaseToken。正常有效租约内，同一行不会同时被两个 worker 领取。发布事务重新锁行并校验 token/status，防止租约被接管的旧 worker 发布数据。

这不是 exactly-once 执行：续租失败或进程暂停超过五分钟时，第二个 worker 可接管；旧模型请求可能仍在执行，最多恢复一次仍可能重复计费。真实 PostgreSQL 测试通过强制过期模拟接管，验证两次替身调用只发布一个分析版本。不将此结果表述为真实模型调用不会重复。

### 其他进程领取的原因和隔离机制

routes 在每个配置完整的 API 实例 onReady 时启动 worker。相同数据库、Storage origin/bucket（PDF 另需相同 embeddingSpace）的实例共享队列；端口和 NODE_ENV 不参与领取条件。Phase 4 记录与代码机制一致，但未保留足以追溯具体历史 PID 的证据。

默认 E2E 清空数据库及外部适配器配置，无业务队列访问。数据库集成测试使用唯一的 .invalid Storage origin 或唯一 embeddingSpace，外部服务明确为替身。此次修复补齐过期清理边界。真实服务 E2E 与开发进程使用相同配置时仍共享队列，必须停止其他同配置 worker，再启动唯一带预算遥测的验收实例；端口检查不能证明 worker 独占。未引入任务命名空间，不声称已实现同配置进程之间的自动隔离或账户级预算锁。

### Phase 4 三次失败分类

| 失败 | 原因与影响 | 修复结论 |
|---|---|---|
| 风险分析非法 JSON | 模型结构化输出不符合契约，任务 failed，无部分发布 | Phase 4 已加入会议专用 JSON mode/示例；保留严格验证，不能承诺模型永不失败 |
| 长文事实不是原文摘录 | 模型改写，精确来源验证拒绝，任务 failed | 安全拒绝是正确行为，不放宽证据；语义遗漏仍需真实验收 |
| 4096 token 截断 | 结构化结果超输出上限，不能解析完整结果 | Phase 4 已独立调整会议上限至 8192，并显式拒绝 length；超长结果仍可失败 |

上述分类依据 Phase 4 已提交记录和现有代码，本轮没有重新调用供应商复现历史失败。集成测试最初的 30 秒超时属于测试耗时配置问题，区别于三次业务失败。

Phase 3 偶发上传 HTTP 500 保持 OPEN。没有根因或修复证据。

## 本轮实际验证

- Node v24.15.0 / npm 11.12.1。
- npm run check：57 项单元/API/兼容性测试通过，类型检查与前后端构建通过。
- RUN_LIVE_TESTS=1 npm run test:integration -- tests/integration/worker-isolation.test.ts：2 passed，34.26 秒，真实 PostgreSQL、独立连接池；Storage/LLM/Embedding 全部替身。
- 测试验证不同 Storage/Embedding 范围的上传中断和处理耗尽记录不被修改，以及有效租约竞争和过期接管后的旧持有者发布隔离。新增唯一标记记录保留，未删除用户数据。
- 本轮未运行真实 LLM、Embedding、Storage、浏览器业务验收；这些不属于本轮通过证据。未读取/输出凭据，测试程序经用户授权加载根 .env。
- 未迁移、部署、推送或发信。长期记忆的模型预算尚未授权。

## 下一里程碑（待本次前置修复审阅）

实现带原始出处的聊天/会议事实提取、PostgreSQL 持久化、来源内去重、跨来源相似事实关联但不合并同名人物、保留时间原文和冲突版本；复用 BGE-M3/pgvector 和现有聊天入口召回，提供简单查看和引用。不得将模型助手回答作为已核实的用户事实，提取失败不能回滚聊天记录。新增迁移须先审查，真实调用先提出请求量与预算并获授权。本记录不表示这些功能已经交付。
