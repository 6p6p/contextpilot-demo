# ContextPilot

工程复盘：[源码架构](docs/ARCHITECTURE_REVIEW.md) 

将对话、文档、会议和可追溯记忆串起来的 AI 决策工作台。

## Live Demo

Railway HTTPS 演示已部署；公网地址待维护者补充。Demo 访问口令线下提供，不写入仓库。

## Features

- 多轮对话与持久化历史。
- PDF 上传、知识问答和页码引用。
- TXT 会议分析、风险待办、可编辑邮件草稿与明确确认后发送。
- 聊天及会议的跨会话长期记忆与来源回查。
- Tavily 联网搜索、来源链接和查询时间。
- 对话指令生成 PowerPoint，下载并用原生软件打开。

## Try It

打开 [面试 Demo Kit](demo/README.md)，下载合成 PDF/TXT，按六项测试从头操作。无需开发脚本或历史数据库记录。

## Tech Stack

React、Vite、TypeScript；Fastify、Zod；PostgreSQL / pgvector、Drizzle；Supabase 私有 Storage；OpenAI-compatible 模型与 Embedding API（现有 DeepSeek / BGE-M3 配置）、Tavily、Resend、PptxGenJS。

## Local Development

使用 Node 24、npm 11，在仓库根目录：

```sh
npm ci
# 将 .env.example 复制为 .env，在本机填写已有服务配置。
npm run check
npm run dev
```

访问 http://localhost:5173。
未配置的集成会明确报告不可用；使用已有 PostgreSQL（含 vector）与私有 Bucket。新数据库需先审查 [迁移](drizzle/)，再手动执行 `npm run db:migrate`；应用启动不自动迁移。不要同时运行连接同一数据库的本地与 Railway Worker。

## Notes

共享口令保护单演示工作区，所有访客共享数据与配额；仅上传合成资料。真实邮件默认关闭，仅允许已授权白名单收件箱，必须复核确认。

模型输出需核对证据；PDF回答偏证据摘录，复杂综合可能不足。搜索时效取决于真实来源，PPT须人工打开检查。进程内AI限额不是账单硬上限；历史偶发上传500仍为观察项。

详细内容：[架构与约束](SPEC.md)、[任务状态](TASKS.md)。历史报告保留当时状态，不等于本轮公网复验结果。
