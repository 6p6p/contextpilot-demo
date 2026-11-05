# Railway Demo 部署准备

状态：本地准备，尚未部署。2026-11-04 授权新增 Railway 费用 US$0；禁止本轮创建 Project/Service、升级/绑定支付、连接仓库触发部署、推送或公网访问。此文操作步骤仅供下一轮审查后手动执行，不构成执行授权。

## 当前账号与资源状态

本机 PATH 未发现 railway CLI，原仓库无 Railway 项目关联。本轮新增 railway.json 是通用配置，不含 Project/Service ID。未读取 CLI 凭据文件、登录账号或查询云端资源，因此账号是否已有可复用项目仍未验证。先由用户在控制台查看；如有可复用项目，只报告名称/Service基本信息，先不修改。若确认没有，正式部署需一个 Project、一个 Node.js Service，本轮没有创建。

## 架构与启动

- 一个 Railway Node.js Service，单副本。Fastify 同进程提供 /api 和 dist/web 的 React/Vite 静态资源，SPA 深链返回 index.html；无需独立前端服务。
- 构建：仓库根目录 npm run build（依赖由Railpack Install阶段安装，.npmrc确保包含devDependencies）。package.json engines 为 Node24/npm11；本地验证 Node24.15.0/npm11.12.1。Railpack 实际选择版本待首轮获批构建日志确认。
- Railway 直接启动 node dist/server/apps/api/src/server.js，避免额外 watch/Worker 服务和 npm 包装影响信号；npm start 是等价本地入口。
- NODE_ENV=production；HOST 默认自动变为0.0.0.0；PORT使用Railway注入值，不把本机3001复制过去。配置 numReplicas=1，无多区域/自动扩容，不添加独立Worker Service。
- 现有PDF、会议、记忆、PPT模块轮询各在该进程启动一次，继续使用PostgreSQL行锁、租约和令牌写入隔离。这里“单Worker”指不另开Worker进程/副本，不替换为新调度框架。不要同时运行连接相同业务配置的本地Worker。滚动替换可能短暂重叠，仍依靠既有数据库租约；不得人为增加副本。
- SIGTERM/SIGINT关闭Fastify、停止轮询并取消服务调用；中断任务依既有租约恢复规则处理，不新增重试框架。
- 保留现有Supabase PostgreSQL/pgvector与私有Storage；数据库池max5、连接超时5秒、语句超时15秒、远程TLS证书验证，未为历史故障调参。不添加Railway数据库、Redis、Volume或文件持久化目录。
- 业务状态/文件均在数据库/Storage，PPT为内存Buffer。服务端/前端运行代码没有.acceptance、tests或临时业务文件依赖；dist/web是必要的构建产物，不是业务数据。可选DATABASE_CA_CERT必须是部署上实际存在的受信证书文件，不能复制Windows本机路径或关闭TLS来绕过。

## 全站访问与费用控制

DEMO_ACCESS_KEY：后端随机32–128字符共享口令。生产环境或非回环HOST未配置会拒绝启动；回环本地开发允许不配置。登录只显示必要静态页面，业务组件登录后才挂载。所有业务API（含列表、上传、下载、AI、会议/记忆/邮件）由Fastify onRequest先验签，前端隐藏不是权限边界。仅健康检查与Demo会话接口公开；前端静态登录壳不包含业务数据或后端密钥。

8小时HMAC会话Cookie为HttpOnly、SameSite=Strict，生产Secure；不是localStorage口令。写操作检查浏览器Origin与当前Host一致，拒绝跨站提交。登录全进程最多5次/分钟。退出清除浏览器Demo/PPT Cookie；其他浏览器已签发Cookie最多仍有效8小时，换DEMO_ACCESS_KEY可统一失效，不增加会话数据库/RBAC。全站Cookie也授权PPT，不要求面试官输入第二个口令；PPT_ACCESS_KEY仅保留本地兼容用途。

默认共享进程限额：

| 项目 | 默认 | 行为 |
|---|---:|---|
| 鉴权后业务API | 300次/分钟 | 所有共享会话合计，超限429 |
| 写操作 | 20次/分钟 | 创建/提交/编辑/重试等尝试合计 |
| PDF/TXT上传 | 5次/小时 | 尝试也计数；匿名请求先拒绝 |
| 模型调用 | 累计100次；10次/分钟 | 前台和所有后台模型实例共用；完整响应读完前并发最多3 |
| Embedding | 累计200次；30次/分钟 | 并发最多2，单批1–16片段 |
| 搜索 | 累计20次；5次/分钟 | 并发最多1；仍受原SEARCH_MAX_CALLS约束 |
| 外部AI请求体 | 256KiB | 超过拒绝，不发送；不把文件大小等同于Token数量 |
| 外部AI响应体 | 4MiB | 有界读取后才释放并发名额；搜索还有既有1MB解析上限 |
| 文件 | PDF6MiB、TXT1MiB | 原解析器/路由双重校验；PDF最多100页、可提取20万字符 |
| 输出Token | 普通默认1024，最多4096；会议/PPT最多8192 | 复用已有适配器/Zod/超时，不扩展无限输出 |

限额在单进程内，失败的上游尝试也计数；重启会重置，不是持久化账单或金额硬上限。不要通过反复重启绕过限额。正式开通前另在供应商控制台确认余额/费用边界；Railway和模型、搜索、Supabase各自计费。本轮实际外部业务API调用0。

EMAIL_DELIVERY_ENABLED固定false。生产配置true会启动失败；不要配置真实发信所需的Resend变量。会议草稿/确认仍可演示，真实发送接口仍由原权限校验拒绝，不为部署启用邮件。

## 环境变量清单

全部在Railway服务端Variables设置；不得使用VITE_前缀存密钥，也不要粘贴.env到日志、Git或聊天。下表不含真实值。“业务必填”指六项功能完整体验所需；应用强制校验访问口令和禁发信，其余缺失时功能明确报未配置，启动仅打印缺失字段名。

| 变量 | 用途 | 必填/敏感 |
|---|---|---|
| NODE_ENV | production模式 | 部署必填；非敏感 |
| DEMO_ACCESS_KEY | 共享访问口令 | 部署必填；敏感 |
| HOST | 监听地址，生产缺省0.0.0.0 | 可选；非敏感 |
| PORT | Railway注入端口 | 平台提供；非敏感 |
| LOG_LEVEL | 基础日志级别，建议info | 可选；非敏感 |
| DATABASE_URL | 现有Supabase PostgreSQL连接串 | 业务必填；敏感，密码仅编码一次，无query/hash |
| DATABASE_SSL | 远程必须true | 必须维持开启；非敏感 |
| DATABASE_CA_CERT | 可选受信CA文件路径 | 可选；不是本机路径，证书部署仍待验证 |
| SUPABASE_URL | 现有项目后端地址 | 业务必填；仅服务端 |
| SUPABASE_STORAGE_KEY | 私有Storage后端权限 | 业务必填；敏感 |
| SUPABASE_STORAGE_BUCKET | 已有私有Bucket名称 | 业务必填；仅服务端 |
| LLM_BASE_URL、LLM_MODEL | 现有模型地址/模型名 | 业务必填；仅服务端 |
| LLM_API_KEY | 模型凭据 | 业务必填；敏感 |
| LLM_TIMEOUT_MS、LLM_MAX_TOKENS | 普通调用超时/输出限制 | 可选；非敏感 |
| MEETING_TIMEOUT_MS、MEETING_MAX_TOKENS | 会议专用限制 | 可选；非敏感 |
| EMBEDDING_BASE_URL、EMBEDDING_MODEL、EMBEDDING_DIMENSIONS | 现有向量服务与空间定义 | 业务必填；服务端，不随意改模型/维度 |
| EMBEDDING_API_KEY | 向量凭据 | 业务必填；敏感 |
| RAG_MIN_SIMILARITY | 检索阈值 | 可选；非敏感 |
| TAVILY_API_KEY | 真实搜索凭据 | 搜索必填；敏感 |
| TAVILY_BASE_URL | 搜索地址 | 可选，保留官方默认；非敏感 |
| SEARCH_TIMEOUT_MS、SEARCH_MAX_RESULTS、SEARCH_MAX_CALLS | 搜索超时/结果数/进程调用限制 | 可选；非敏感 |
| PPT_SCOPE、MEMORY_SCOPE、EMAIL_SCOPE | 现有数据/队列配置范围 | 可选默认demo；服务端，部署前选择演示范围 |
| PPT_MAX_TOKENS | PPT规划输出上限 | 可选；非敏感 |
| PPT_ACCESS_KEY | 本地旧PPT单独口令 | 全站DEMO口令存在时可选；敏感；不要作为第二个登录要求 |
| DEMO_API_PER_MINUTE、DEMO_WRITES_PER_MINUTE、DEMO_UPLOADS_PER_HOUR | API/写/上传次数 | 可选；非敏感，见默认限额 |
| DEMO_MODEL_CALLS、DEMO_EMBEDDING_CALLS、DEMO_SEARCH_CALLS | 统一累计上游次数 | 可选；非敏感，重启重置 |
| EMAIL_DELIVERY_ENABLED | 邮件开关 | 必须false；非敏感 |
| RESEND_API_KEY | 发信凭据 | 本轮不配置；敏感 |
| EMAIL_FROM、EMAIL_ALLOWED_RECIPIENTS、EMAIL_TEST_ACCOUNT_ADDRESS、RESEND_DOMAIN_ID | 原邮件配置 | 本轮不需要；地址/白名单视为私有配置，不放前端 |
| EMAIL_MODE | 旧邮件模式 | 可选默认test，不改变发送关闭状态 |
| API_PROXY_TARGET | 本地Vite代理 | 生产不需要，不是公网API地址配置 |

根.env.example只有空凭据和公开默认配置。Railway Variables不能整份照搬本地NODE_ENV/HOST/PORT/证书路径。项目根目录必须包含package.json、drizzle和构建入口；不要把Root Directory设为apps/api。

## 预检与健康检查

```sh
npm run check
npm run test:e2e:production
npm run test:production:smoke
# 以下仅在获批、配置好真实服务变量之后运行：
npm run deploy:check
npm run db:status
```

deploy:check只校验变量是否齐备/格式/生产模式，打印缺失字段名，不连接外部服务；不证明凭据有效。db:status只SELECT迁移记录，核对仓库SQL SHA和时间，不执行SQL迁移；缺失、改变或多余记录退出非零。上个已关闭Phase8已验证增量0008，本轮不读取真实数据库/凭据，不假称再次验证了线上状态。没有preDeployCommand，不启动自动迁移，更不reset/drop/truncate。若实际状态不匹配先停，不盲目重复db:migrate。

- /api/health：存活检查200，不代表数据库/模型/Storage可用。
- /api/ready：数据库实际probe成功才200；未配置/不可达503。railway.json采用此路径、120秒超时；该接口不代表六项业务均验收通过。
- x-request-id用于关联基础错误日志。请求日志只记录method/无query的路径，Cookie/Authorization不入日志；错误响应不输出凭据，启动失败使用固定脱敏消息。Worker沿用既有状态错误码与恢复语义。
- 生产缺口令、非回环地址缺口令、误开邮件或无效PORT会失败退出。其余服务缺失可启动诊断UI，但必须通过deploy:check才能进入正式云端验收。

## Free方案与费用边界

2026-11-04查阅官方：[Plans](https://docs.railway.com/pricing/plans)、[Free Trial](https://docs.railway.com/pricing/free-trial)、[Config as Code](https://docs.railway.com/config-as-code/reference)、[Healthchecks](https://docs.railway.com/deployments/healthchecks)。

Free为US$0/月，含每月US$1 credit、单副本/0.5GB RAM/1vCPU；试用为最多30天或一次性US$5，用完转Free。受限试用有出站网络/端口限制，不能假设一定能连接Supabase PostgreSQL与各API。能否稳定跑当前PDF解析、PPT生成和后台轮询**待实际验证**；本轮没有部署或压测，不承诺Free足够，也不以“免费”名义创建无法确认收费的资源。后台轮询会持续访问数据库，不应假设服务能够空闲休眠节省全天费用。

Hobby当前最低US$5/月，抵扣资源用量，超额另计。官方资源价RAM US$10/GB月、CPU US$20/vCPU月、出站US$0.05/GB。仅作后续预算例子：若平均RAM0.2–0.5GB、CPU0.01–0.05核，资源约US$2.2–6/月，计入最低承诺后约US$5–6/月再加网络等；这是**假设，未测量**，不能当费用上限，实际占用更高会超出。需要付费时先报告实际账号方案与测量，再申请授权，本轮绝不升级/绑卡。

## 下一轮手动步骤（须先另行授权）

1. 用户注册/登录Railway，只读查看当前Plan、credit、到期/耗尽行为、账号验证和网络限制；若有既存Project/Service先报告，不自行修改。
2. 用户确认US$0能覆盖目标时段，否则先讨论Hobby预算；确认外部模型/搜索/Storage余额和演示调用预算。未确认不创建资源。
3. 审查本地commit后，另行批准推送/选用GitHub仓库。**连接仓库通常会触发构建/部署，本轮不要点击连接或Deploy。** 后续获批才连接私有GitHub仓库的指定分支，根目录为仓库根。
4. 若没有可复用资源，再获批新建1个Project/1个Node Service；不加数据库、Volume、Redis或Worker Service。核对Railpack构建命令、直接Node启动、一个副本及无多区域。
5. 在服务端Variables填写上表，设置production/0.0.0.0/口令和false邮件开关；保留平台PORT，不暴露密钥到VITE。确认演示数据范围以及Supabase网络/TLS/私有Bucket权限和剩余额度，不创建/公开Bucket。
6. 在获批环境完成deploy:check和只读db:status。需要自定义CA或迁移不匹配时先停止报告，不绕过TLS或自动迁移。
7. 获批后才构建并检查Node/npm版本、/api/ready、日志和单副本；再获批生成Railway HTTPS域名。真实Supabase读写、六功能/重启恢复和费用监测仍需这一阶段实际验收，不能用本地替身结果冒充。
8. 面试官使用单独安全渠道获得Demo口令；演示结束停止不再需要的运行资源由用户决定，不能擅自删除。保持邮件关闭。

## 未完成项分级

**阻塞正式上线**：尚无创建/推送/公网部署授权；账号资源、Free余额/网络和实际用量未验证；Railway服务端变量/口令尚未配置；真实迁移状态/TLS/Storage/域名/六功能/重启恢复需在获批平台验证。本地代码准备不等于已上线。

**可观察**：Phase3未复现上传HTTP500；历史PG连接超时。仅实际复发时按request ID排查；不加推测性重试/基础设施。低内存平台上的PDF/PPT峰值、免费credit消耗后行为和移动端现场体验，待授权验证。

**非必要未来优化**：OAuth、用户/RBAC、持久化会话撤销/计费系统、复杂限流/压测、多实例队列、生产级安全审计。均不属于本Demo准备，不启动Phase9A。

首次构建失败修复（2026-11-05）：Build阶段只执行npm run build；不要在此再次npm ci。Install由Railpack处理，仓库.npmrc include=dev覆盖生产默认省略dev的行为。NODE_ENV维持production，密钥不用调整。控制台Custom Build Command为空时仍采用railway.json；本地修复未push/未触发新的部署。完整证据见phase-9-verification.md末尾。
