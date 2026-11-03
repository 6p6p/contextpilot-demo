# Phase 2 本地接入与验收

## 配置位置

仅在 `D:\projects\contextpilot-demo\.env`（仓库根目录）自行填写真实配置。此文件被 Git 忽略；不要在聊天中粘贴、不要提交，也不要放入 apps/web 或 VITE_*。可参考 .env.example；如果已有 .env，不要覆盖其他设置。

```dotenv
DATABASE_URL=postgresql://USER:ENCODED_PASSWORD@HOST:5432/postgres
DATABASE_SSL=true
DATABASE_CA_CERT=
LLM_BASE_URL=https://PROVIDER/v1
LLM_MODEL=YOUR_MODEL
LLM_API_KEY=YOUR_KEY
LLM_TIMEOUT_MS=45000
LLM_MAX_TOKENS=1024
```

上面只有占位符。数据库需要项目的 PostgreSQL 密码，不是 anon/service_role API Key；不需要 Supabase 前端 SDK。Base URL 是 API 前缀，不是完整 chat/completions 地址；后端追加 `/chat/completions`。模型需支持非流式 Chat Completions、system/user/assistant 消息和 max_tokens 参数；供应商差异仍需实际验证。

## Supabase Direct 与 Session pooler

在 Supabase 项目 **Connect** 面板选择连接方式并复制 URI：

- Direct connection：适合常驻后端。通常需要 IPv6；具体以控制台网络说明为准。
- 本机/网络没有可用 IPv6：切换 **Session pooler**，使用控制台给出的完整 URI（通常 5432）。用户名与 Direct 不同，常为 postgres.PROJECT_REF，不能只替换主机。
- 本阶段不用 Transaction pooler（通常 6543），也不需要为 IPv4 创建付费资源。

参考：https://supabase.com/docs/guides/database/connecting-to-postgres

密码包含特殊字符时，只将密码部分进行一次 URL percent-encoding，不编码整个 URI。例如测试密码 `example@#%` 变成 `example%40%23%25`。不要把真实密码放进 shell 命令或在线编码网站。密码已编码时不要再编码 `%`。URI 不允许查询参数；如果面板 URI 带 sslmode 参数，移除查询串，改用 DATABASE_SSL=true。

后端通过 URL 解析后将用户名、密码解码一次，分别交给 pg；不传 connectionString，避免 SSL 参数覆盖。远程连接必须启用 TLS，rejectUnauthorized 始终 true。参考：https://node-postgres.com/features/ssl

如遇证书链验证错误，从 Supabase 控制台数据库 SSL 设置下载项目 CA 公共证书，放在本地 `certs/`（已忽略），将 DATABASE_CA_CERT 配为证书绝对路径。不要填写私钥，不使用 NODE_TLS_REJECT_UNAUTHORIZED=0，也不关闭证书校验。

## 执行顺序

确认配置完成并同意程序运行真实连接后，在仓库根目录：

```sh
npm run db:check
npm run db:migrate
npm run db:check
```

第一次 check 若显示 vector 可用但未安装，尚未通过扩展验收；迁移中的 0000 负责启用，然后再次检查。check 验证数据库连接、本机 TLS socket 的加密和证书授权状态，以及真实 vector 距离运算。pg_stat_ssl 另行报告服务端连接状态；经过 pooler 时，它描述 pooler 到数据库这一段，不能代替客户端 TLS 检查。不会输出连接串或密码。

0001 迁移已审查：新增 conversations/messages，新增主键、外键、唯一索引和约束，启用 RLS；无 DROP、DELETE、TRUNCATE、数据重写或旧字段修改。不要使用 drizzle-kit push/reset。如果云端已有同名表，迁移会失败，需先检查，不能删表强行通过。迁移执行由 Drizzle 日志表记录，启动服务不会自动修改数据库。

## 测试分层

```powershell
# 无云服务调用：API/config/context 测试、Mock 模型协议测试、库兼容性、类型与构建
npm run check
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:e2e
npm run test:e2e:production

# 确认配置、迁移和服务调用授权后才执行
$env:RUN_LIVE_TESTS='1'
npm run test:integration
npm run test:e2e:live
```

- 默认 E2E：真实本地 Web/API，显式清空数据库和模型配置，只证明 UI、错误展示和健康链路。
- integration：真实 PostgreSQL，明确使用 stub 模型，证明跨连接持久化、去重、并发拒绝、失败记录和中断恢复。不会声称模型真实可用。
- live E2E：真实 PostgreSQL + 真实模型，不使用路由拦截或伪造响应。默认两次生成，可能计费；验证独有代号的多轮回答、刷新恢复和会话切换。需要确认预算，自动重试为 0。
- 测试保留带 acceptance/验收标记的独立会话，不自动删除云端数据。真实模型测试关闭 trace，避免在 trace 中保存业务内容；不要将历史测试产物提交版本库。

测试专用端口为 3101/5273；开发继续使用 3001/5173。实际服务验收失败时报告失败，不用 Mock 替代。

## 当前状态与限制

真实 Supabase 连接、客户端 TLS/CA、pgvector、迁移、持久化和 DeepSeek 多轮浏览器验收已通过，记录见 [Phase 2 验收](phase-2-verification.md)。真实模型验收包含两次生成；本次多轮手动排错共执行五次调用，未自动重试。

当前 pg_stat_ssl 未报告 pooler 到数据库这一段启用 SSL，本机到 pooler 的 TLS 加密和证书校验已单独确认。Supabase SSL enforcement 可控制两段连接，但切换会重启数据库；本轮未修改此云端配置。正式公开部署前应由项目所有者确认此设置并复测。官方说明：https://supabase.com/docs/guides/platform/ssl-enforcement

历史持久化全部保存在 PostgreSQL；页面最近显示 100 个会话/200 条消息，模型使用最近最多 20 条已完成消息、24000 字符。localStorage 只保存当前会话 ID，不作为消息存储。90 秒后仍 pending 的回复在下次读取时标记中断，不自动再次调用模型。

尚无工作区登录鉴权，仅允许本机开发，不可直接公开部署。PDF/RAG、跨会话长期记忆与工具调用均未实现；当前 ContextProvider 和 ChatModel 只提供后续扩展边界。
