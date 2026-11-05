# Phase 9 本地部署准备验收

状态：本地准备完成；没有部署、没有公网URL。Railway新增费用授权US$0，本轮实际新增Railway资源/消费0，外部模型/Embedding/Tavily/Resend/真实数据库/Storage调用0。取消独立Phase9A。原题六项功能的真实集成证据仍是已关闭Phase2–8，不把本轮离线测试称为真实云端验收。

## 已完成

- apps/api/src/demo/access.ts：全局业务API onRequest验签、生产/非回环地址缺口令失败、共享全站Cookie、同源写验证、登录5次/分钟、共享API/写/上传尝试限额。未授权上传在解析请求体前401，下载与AI也先拒绝，旧PPT Cookie不能绕过全站门禁。静态登录页面无业务数据，健康与会话接口公开。
- demo/limits.ts与app.ts：所有前台/后台模型、向量、搜索适配器共用单进程累计/分钟/并发次数；上游失败计数，256KiB请求与4MiB响应上限；读取完整响应才释放并发名额。普通聊天原先直接createChatModel(env)也已传入同一个限额/取消transport，不能漏计。
- config/env.ts、server.ts：生产必须有32–128字符Demo口令、邮件必须false，HOST未指定时生产自动0.0.0.0，PORT保留平台注入。无效环境启动固定脱敏错误；其他未配置服务打印字段名警告；存在健康不等于所有功能可用。响应增加x-request-id，生产日志只记录method/去query的路径，不输出Cookie/Authorization。
- config/deployment.ts、check-deployment.ts：完整六功能环境变量只读presence预检，打印字段名，不输出值、不发网络请求；npm run deploy:check使用编译产物。
- db/status-service.ts/status.ts：npm run db:status只SELECT迁移记录，对照真实仓库SQL hash/时间，缺失/改变/未知版本退出非零，无SQL迁移/回滚。本轮真实库状态未重新访问；Phase8已确认0008，后续部署前再授权查询。
- presentations/auth.ts：全站会话授权PPT；app启用PPT Worker不再依赖单独旧口令。原本仅PPT口令的本地方式继续兼容，全站打开时所有接口仍必须全站验证。
- DemoAccess.tsx/main.tsx、App.tsx、PresentationPanel.tsx/styles.css：登录前不挂载业务组件，口令只在瞬态输入/请求体，登录后清空；退出清Cookie、刷新保留授权、定期检查过期状态，避免旧状态请求覆盖新登录/退出。PPT复用工作区权限；删除已实现功能仍写待开发的旧文案，不改布局框架。
- railway.json：Railpack仓库根构建，单副本，直接Node启动，/api/ready，120秒，崩溃最多3次平台重启；无preDeploy迁移命令。原数据库租约Worker不另开Service/进程，无Redis/新数据库/Volume。
- .railwayignore/.env.example及文档：不上传.env、验收目录、测试结果、证书目录等。只记录空凭据/公开默认值；部署说明区分业务必填/可选/敏感字段及账号/费用/人工步骤。
- scripts/e2e.mjs/redact-output.mjs：离线生产模式只使用合成访问口令，禁用真实服务，清Cookie日志包含cp_demo；PPT旧生产单测先通过全站门禁，再验证原Secure/限流，未降低断言。

## 实际命令和结果

环境Node24.15.0/npm11.12.1；所有命令在仓库根执行：

1. npm run check：155测试，15个文件，类型检查与两个构建PASS。包括原聊天/PDF/会议/记忆/搜索/邮件/PPT unit/API/兼容性回归。没有真实PostgreSQL或供应商调用。
2. PLAYWRIGHT_CHANNEL=chrome npm run test:e2e：开发模式1/1 PASS。
3. PLAYWRIGHT_CHANNEL=chrome npm run test:e2e:production：真实编译服务器+浏览器1/1 PASS；先登录，匿名数据API/AI/上传/下载401，带request ID；登录后文件6MiB/1MiB上限413；PPT复用访问权限；SPA /interview深链、刷新、移动端无水平溢出、退出后401。服务未配置的业务诚实报告unconfigured，不借此声称六功能线上已通过。
4. npm run test:production:smoke：PASS。临时CWD仅复制dist/web，绝对入口运行编译服务器，禁用根dotenv与所有真实服务凭据；2种配置presence CLI结果正确；缺Demo口令/误开邮件/无效PORT3种启动失败均非零且不泄露值。无数据库/本机不可达合成数据库两种状态：health200、ready503；0.0.0.0/动态PORT、静态SPA、实际鉴权、请求429、无敏感日志、SIGTERM退出均通过。测试目录只是QA输出，应用没有本地业务持久化依赖。
5. git diff --check：PASS。155测试内有迁移记录匹配/缺失/改变/多余情况的只读替身检查，没有执行migrate/reset/drop/truncate。
6. 本地tracked与非忽略新增文件基础检查：无凭据格式可疑项，无私有PDF/PPTX/验收目录/.env；本地已知Git历史未出现.env或.acceptance路径。只有原有3份明确标注Synthetic的PDF测试夹具。前端bundle未出现后端secret变量名，源码未使用VITE密钥。未读取根.env真实值执行扫描，也未查询/修改GitHub。

关键新增测试：API、上传/下载/AI匿名401；HMAC防篡改/过期/不同密钥；全站Cookie授权PPT而旧PPT Cookie不可绕过；Origin403；登录次数、GET/写/上传次数429；文件413；生产邮件true拒绝；全实例共享上游次数；失败上游仍计数；延迟响应体期间第四个模型请求被拦；长输入拒绝；完整部署presence与只读迁移状态。日志脱敏复用原分块流测试并加入cp_demo合成Cookie。

失败与修正：旧PPT生产单测在新增门禁后被正确拒绝，测试改为先登录Demo，原PPT安全断言保留。初版本地smoke停止函数在已经被SIGTERM退出的子进程上再次等待exit，导致unsettled top-level await；同时检查signalCode修正，仅测试编排改动，最终smoke通过。并发复核发现只等HTTP头不足，改为有界完整响应读取并用延迟响应体测试证明。没有真实服务失败、真实上传HTTP500或付费调用。

## UI复核

使用react-best-practices技能对多处TSX做约束内复核：保持React/Vite/CSS，不引入Next/SWR/UI库；hooks不条件调用，effect含AbortController/定时器清理，异步登录状态用revision防旧响应覆盖，表单有label/type=password，口令不进localStorage。Chrome实际登录截图已目视检查，桌面布局清晰；工作台/移动端宽度检查通过。技能参考不是部署认证或生产级安全审计。

## 资源/服务未验证项与下一步

Railway CLI未安装在PATH、未发现原项目关联文件；未查看账号或私有凭据，不能断言账号无项目。新增railway.json仅配置模板，不是Project绑定。用户先只读查看账号；有既存Service先报告不改，否则下一轮需明确授权创建一个Project/Service。GitHub仓库连接可能立即触发部署，本轮不连接、不推送。完整操作与变量表见[部署说明](railway-deployment.md)。

官方Free目前每月US$1 credit、0.5GB/单副本，试用最多30天或US$5；受限试用可能不能访问所需外部端口。**当前Demo是否适合Free待实际验证**，未测量平台RAM/CPU/网络或承诺免费长期稳定运行。Hobby US$5最低/月、超额按用量；文档仅提供明确假设的费用示例，不申请或升级。本轮US$0边界未突破。

阻塞实际部署：无新建/推送/公网部署授权；账号credit/网络与Free可行性、服务端变量/口令、Supabase TLS/实际迁移匹配/私有Storage读写、实际Worker重启与六功能云端验收仍待授权验证。供应商余额/预算、Railway构建实际Node/npm版本也需确认；存在配置不等于凭据有效。

观察项：Phase3偶发未复现上传HTTP500、既往DB连接超时，均不作为本地准备失败；实际复发再排查，未增加重试框架。进程内限额重启会清零，8h无状态会话在其他浏览器不因本次logout统一撤销；这两项边界已在部署说明中写明，必要时手动轮换口令/确认供应商费用限制，不做SaaS系统。

非必要未来优化：OAuth/RBAC、多用户、复杂计费/限流、压力测试、独立任务平台、历史故障专项、Phase9A，全部未开发。

Phase8由用户确认实际PowerPoint/WPS打开验收通过并正式关闭，已更新原验收记录。EMAIL_DELIVERY_ENABLED保持false：本轮没有改动真实.env，生产误配true拒绝，所有测试强制false。没有真实邮件、部署、资源购买、外部业务API或远程Git操作。本地准备通过后创建本地commit，停止等待用户审查，不等于Phase9公网交付完成。

## 2026-11-05 首次 Railway Build 失败的最小修复

用户报告Service perceptive-spirit、GitHub 6p6p/contextpilot-demo、Railpack首次Build失败。根据提供的日志，Install已执行npm install，Build又执行npm ci --include=dev && npm run build，在清理/app/node_modules/.vite时EBUSY。实际命令来源是仓库railway.json，而不是空的控制台Custom Build Command。仓库不存在railway.toml/railpack.json；package.json的build仅tsc+vite，没有二次安装生命周期脚本；现有.npmrc原为engine-strict=true。

修复：railway.json buildCommand仅npm run build；现有.npmrc增加include=dev，NODE_ENV=production仍安装构建必需的TypeScript/Vite。依赖安装继续由Railpack Install负责，不添加新安装步骤、移动依赖或修改锁文件。include=dev也会使主动npm prune --omit=dev保留开发依赖；本仓库未显式配置prune，若今后需要运行镜像裁剪需另行配置，本次不扩大修复。

Railway无需为了本修复更改NODE_ENV或任何密钥。Custom Build Command可保持空，使用更新后的仓库配置；如手动填写，只填npm run build。若服务有额外自定义Install/Build覆盖，后续获批部署前只检查其是否仍有二次安装或自定义脚本；本轮未查询/修改控制台变量，也未push或触发部署。官方参考：https://railpack.com/languages/node/ 与 https://docs.npmjs.com/using-npm/config/ （npm include优先于omit）。

本地验证：NODE_ENV=production下npm config get include返回dev，npm run build通过；npm run check通过155项测试、类型检查及构建。新增部署断言防止buildCommand回到安装+构建，并确认include=dev。npm run test:production:smoke通过；Chrome生产E2E 1/1通过。没有在Railpack容器复现EBUSY，也未进行新的Railway构建，云端修复效果待用户后续授权部署验证。业务代码/API/数据库/密钥均未改变。

## 2026-11-05 Railway PostgreSQL 严格 TLS 修复（本地完成，待发布）

用户已确认公网业务API500，容器TCP_OK、pg可用而pg.connect报SELF_SIGNED_CERT_IN_CHAIN。该证据指向客户端缺少数据库签发CA信任链，不应以关闭验证解决。用户提供根目录prod-ca-2021.crt，声明来自Supabase官方控制台。

检查：证书仅含公开PEM，无私钥/额外文本；CA=true，自签名验证通过，有效期2021-04-28至2031-04-26；Subject/Issuer Supabase Root2021 CA；SHA256指纹80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA。自签名检查不是独立控制台来源认证，来源依据用户下载说明，指纹测试用于后续变更审查。

现有db/client.ts已明确ssl.rejectUnauthorized=true，并在DATABASE_CA_CERT提供时载入ca；已安装pg8.23.1将实际host用于Node TLS identity校验并为DNS主机设置servername，无自定义checkServerIdentity绕过。因此不改连接池、连接参数、业务、SQL或数据。parseEnv已拒绝DATABASE_URL所有query/hash，包含sslmode/sslrootcert/sslcert/sslkey，且手动拆分URL不传connectionString给pg。实际Railway DATABASE_URL和凭据未读取/改动；后续需用户核对。

最小改动：公开prod-ca-2021.crt入库；scripts/copy-database-ca.mjs在构建时校验公开CA并复制到dist/server/certs/prod-ca-2021.crt（不放前端dist/web）；package build保留tsc/Vite，仅增加证书复制，不重复安装。源证书在根目录，不受.gitignore/.railwayignore的certs/排除；dist是构建阶段生成，进入Railway运行产物。本机与编译产物CA SHA一致。没有提交私钥、数据库密码或真实.env。

新增npm run db:tls（编译入口db/tls-check.js）：仅创建数据库连接池，要求DATABASE_SSL和CA路径，连接后检查客户端encrypted/authorized，再执行SELECT1；不启动App/Worker/模型或迁移，不输出URL/密码。失败非零、固定脱敏消息。本轮未加载真实.env或执行云端/真实数据库请求，不声称已完成实际TLS握手/SELECT1/线上API验收。

实际测试：npm run check PASS157测试/15文件、类型与两个构建；npm run test:production:smoke PASS；Chrome生产E2E1/1 PASS；源/构建CA字节SHA对比PASS。新增公开CA指纹/严格ssl.ca/default hostname行为、CA缺失失败，以及所有SSL query覆盖拒绝回归。实际Railpack镜像/网络/服务器证书SAN匹配待后续验证，不能用本地配置测试替代。

待用户批准发布时设置（本轮未操作Variables，保存变量可能触发部署）：
- DATABASE_SSL=true
- DATABASE_CA_CERT=/app/dist/server/certs/prod-ca-2021.crt
- DATABASE_URL保留实际Supabase DNS主机和连接信息，删除全部query/hash，尤其sslmode/sslrootcert/sslcert/sslkey；密码只编码一次，不改为IP或其他主机绕过身份校验。
- 保留NODE_ENV=production、EMAIL_DELIVERY_ENABLED=false及其他密钥，不设置NODE_TLS_REJECT_UNAUTHORIZED=0。

批准push/部署之后，先在容器确认绝对路径证书存在，再npm run db:tls。只有Strict client TLS verified; SELECT1 passed才继续验证/api/ready及登录后的只读业务API（如会话列表），不触发模型/邮件。若仍失败，按实际CA链/主机名/连接参数排查，不降级验证。/app依据用户日志的工作目录；若后续Root Directory改变，先核对实际绝对路径，不盲用Windows路径。

Supabase官方说明：https://supabase.com/docs/guides/database/psql；pg说明：https://node-postgres.com/features/ssl。本轮只本地提交，不push、不部署、不改云端变量；Phase3上传500仍为观察项，与本次明确TLS错误区分。

## 2026-11-05 聊天搜索回答质量最小修复（离线）

用户已验证公网TLS、AI聊天、记忆和Tavily可用，但Node.js当前LTS问题引用旧文章，未明确回答当前状态。本轮只修复聊天搜索证据流程，不调用真实Tavily/模型、数据库/Storage，不修改PPT、邮件、数据库或架构；不push/部署。

根因：query原样发送，无任务域名/日期提示；只校验来源ID和逐字子串，不评估权威性/时间；答案仅罗列摘录，不能区分历史LTS/当前Active或Maintenance。

实现：search/evidence.ts按当前问题识别官方要求，使用小型受审查机构映射（Node.js/nodejs.org、Python/python.org、PostgreSQL/postgresql.org），绝非通用固定nodejs.org规则。未知机构不假认官方；域名/HTTPS/凭据校验拒绝伪装地址。answerWithSearch在一次Basic请求中传可选include_domains和UTC查询日期提示；先做原有私密查询检查，不传历史/资料。SearchProvider的第二参数可选：PPT等原调用不传参数，发送查询不变，已用Mock断言，不改PPT模块。

候选按官方、近期、发布时间排序；30天为保守近期窗口，不是事实可信性证明。未来日期/超窗文章不能支持当前结论；无发布日期的归档blog/news/release不能支持当前结论，不能补造时间。无日期的状态页必须有直接的当前/最新/Active证据，同时展示发布时间未提供，不把查询时间当发布/更新时间。版本数字大小不会自动产生最新结论。存在更晚的直接当前状态证据时，不接受较早文章作为当前结论。LTS同一最新日期或未知日期的可识别Active版本矛盾会保守拒绝；其他自然语言语义冲突仍需模型识别，不宣称规则解决所有事实冲突。

模型在原一次JSON/non-thinking/max4096调用内选择status、conclusion逐字引文、citations；服务器对结论和所有引文重新检查实际ID/原文。任意额外answer文字不渲染。未知来源/改写引文仍SEARCH_INVALID_CITATION。只有supported且通过权威/时效检查才先输出结论，后列来源URL/查询时间/真实发布日期，非近期摘录标仅供对照；不满足则明确证据不足，conflicting则明确无法确认且保留差异。全部实际返回结果元数据继续保留，未采用项quote空，不冒充已引用；历史消息结构和数据库不变。

修改文件：apps/api/src/search/{service,evidence}.ts、tests/unit/search-current.test.ts、README/SPEC/TASKS及本记录。固定Mock2026-11-05中包含旧2026-07文章、官方v26.13.0 Active与v24 Maintenance状态；这些数字仅在测试数据中，不作为运行时硬编码事实。七项新增测试覆盖正向结论、过期/未知时间归档、更晚证据、同期冲突（即使模型宣称supported也拒绝）、机构隔离/伪域名、伪造结论及一次Basic提示/共享适配器兼容。旧隐私/注入/失败/来源真实性回归保留。

实际结果：npm run check通过164测试/16文件、类型检查和双构建；npm run test:production:smoke通过；Chrome生产E2E1/1通过；git diff --check通过。全部为离线Mock/本地生产模拟，新增付费模型/搜索0，没有新真实API/数据库验收。首次测试因预期未使用原有NFKC归一化而失败，测试改为publicQuery(q)，未放松查询隐私校验。

限制：当前保守策略可能拒绝仅有历史发布/不足摘要的问题，而不是凑出最新结论。官方机构映射有限，来源发布日期/摘要本身不保证真实性；实际线上改进需后续单独授权搜索/模型验收，当前不宣称已验证线上回答。待本地commit后停止，暂不push、暂不部署；保持邮件false。
