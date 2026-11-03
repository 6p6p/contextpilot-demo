# ContextPilot

面向南京信人智能的 AI 外脑实操 Demo。原始需求见 [docs/assignment.txt](docs/assignment.txt)；阶段规范见 [SPEC.md](SPEC.md)，开发状态见 [TASKS.md](TASKS.md)。

**当前仅 Phase 1 工程骨架。六项业务能力尚未实现。** 页面真实请求 Fastify 健康接口，不模拟聊天、上传、邮件或 PPT。尚未部署、未推送 GitHub。

## 环境与启动

要求 Node.js 24.x、npm 11.x、Git；无需全局 CLI。本项目依赖锁定于 package-lock.json。

在仓库根目录执行：

```sh
npm ci
npm run dev
```

浏览器打开 http://127.0.0.1:5173 。API 为 http://127.0.0.1:3001/api/health 。根脚本同时运行前后端，Ctrl+C 停止两者。也可分别运行 `npm run dev:api`、`npm run dev:web`。

无需创建 .env 就能启动 Phase 1。默认数据库未配置，页面应明确显示“数据库未配置”。`GET /api/health` 是存活检查，不代表任何外部服务可用；`GET /api/ready` 在数据库未配置或不可达时返回 503。

## 检查与构建

```sh
npm run typecheck
npm test
npm run build
# 或一次执行以上检查
npm run check
```

浏览器测试（首次需安装项目使用的 Chromium；不安装全局工具）：

```sh
npx playwright install chromium
npm run test:e2e
# 构建后检查生产静态服务及同源 API
npm run build
npm run test:e2e:production
```

Playwright 默认下载至用户缓存。若希望浏览器也保存在项目依赖下，PowerShell 中先执行 `$env:PLAYWRIGHT_BROWSERS_PATH='0'`，然后在同一终端执行上述安装和测试命令。测试自动启动真实 Vite/Fastify 服务，5173 和 3001 端口需空闲；不拦截或伪造 API 响应。浏览器安装不应写入版本库。

已有 Chrome 时，可设置 `$env:PLAYWRIGHT_CHANNEL='chrome'` 后直接运行 E2E，无需下载 Chromium。本轮使用此方式验证。

生产构建本地验证：先 `npm run build`，然后 PowerShell：

```powershell
$env:NODE_ENV='production'
npm start
```

访问 http://127.0.0.1:3001 。生产模式由同一个 Fastify 服务提供 `dist/web` 和 `/api/*`；根目录启动，不要在 dist 子目录运行。Unix 对应 `NODE_ENV=production npm start`。结束验证后可移除当前终端变量：`Remove-Item Env:NODE_ENV`。

## 目录

```text
apps/web/             React 页面、CSS、Vite 配置
apps/api/src/         Fastify 服务、环境校验、数据库工具
shared/               前后端共享 Zod 契约
drizzle/              版本化 SQL 迁移及元数据
tests/unit/           配置、真实 API 与库兼容性测试
tests/e2e/            浏览器到真实后端测试
docs/assignment.txt   不可修改的原始要求
```

## 环境变量

`.env.example` 只有示例。经授权配置实际凭据后，可在根目录创建被 Git 忽略的 `.env`。后端由 dotenv 读取；不要提交真实文件，也不要使用 `VITE_*` 保存密钥。

| 变量 | 默认值 | 用途 |
|---|---|---|
| NODE_ENV | development | development/test/production；生产时启用静态页面 |
| HOST | 127.0.0.1 | 本地绑定；容器部署时需设置 0.0.0.0 |
| PORT | 3001 | API 端口，1–65535 |
| LOG_LEVEL | info | fatal/error/warn/info/debug/trace/silent |
| DATABASE_URL | 未设置 | postgresql:// 或 postgres:// 连接串；空值表示未配置 |
| DATABASE_SSL | false | true 时开启 TLS 并验证服务端证书；托管库按供应商要求配置 |
| API_PROXY_TARGET | http://127.0.0.1:3001 | 仅开发时 Vite 代理目标，修改后需重启 |

环境变量无效时启动失败；错误不打印凭据值。数据库地址通过格式校验不代表连接成功。数据库连接串若携带 SSL 参数，其行为遵循 node-postgres，避免与 DATABASE_SSL 混用相冲突的参数。

## 数据库与迁移

Phase 1 不创建业务表，仅提供连接工厂、真实查询探测和初始化 vector 扩展迁移。需要支持 pgvector 的 PostgreSQL 与扩展创建权限。

```sh
npm run db:check
npm run db:migrate
# 后续获批新增 schema 后生成并审查版本化迁移
npm run db:generate
```

未配置 DATABASE_URL 时，前两个命令明确失败并返回非零退出码，不伪造成功。`db:migrate` 会修改目标数据库，只能对获授权的数据库执行；不在服务启动时自动迁移。`db:generate` 离线生成迁移，不需要数据库凭据。当前无业务 schema，后续按阶段增加。

本轮未提供数据库凭据，因此实际连接、迁移执行和服务端 vector 扩展可用性尚未验证。Drizzle 向量 SQL 兼容性测试不能替代真实数据库验证。

## 公网部署方案（尚未执行）

1. 经确认选择支持 Node 24 常驻进程、HTTPS、环境注入及日志的容器托管服务；从南京实际演示网络测试访问。
2. 构建阶段 `npm ci`、`npm run check`；运行阶段根目录 `npm start`，配置 NODE_ENV=production、HOST=0.0.0.0、平台要求的 PORT。
3. 使用持久化 PostgreSQL + pgvector 和私有对象存储；后续全部用户文件、记忆、向量、任务都不得依赖容器临时磁盘。
4. 对目标数据库单独执行已审查迁移；配置连接池、TLS、备份和区域。健康探针用 `/api/health`；数据库部署就绪检查用 `/api/ready`。
5. 公开业务应用前必须完成演示工作区保护、文件鉴权和调用限额；Phase 1 不能当作已完成的公网 Demo。
6. 后续经确认接入 LLM、embedding、搜索、邮件。验证地域限制、额度、中文效果、超时和发件域名。邮件必须确认、去重并保存发送记录。
7. 最终再完成 GitHub 推送、演示脚本、六项功能真实验收材料。本轮不创建资源、不调用付费服务、不部署或远程推送。

供应商、价格、访问稳定性、邮箱送达和数据库权限均需后续实测。尚未设置任何 LLM、embedding、对象存储、搜索或邮件凭据，当前不要求这些环境变量。
