# Phase 6 Email Delivery 验收记录

最终状态：Phase6受限真实业务验收通过。两封真实邮件均delivered且用户逐封确认收件；发送关闭。以下保留离线阶段、失败预检与逐封验收的历史记录，以本节及文末最终结论为当前状态。基线为用户接受的Phase5提交b14a99e。按功能里程碑推进，不按日期规划。

## 授权与实际操作

用户允许代码、迁移文件、测试和文档，明确禁止未经再次批准发送任何真实邮件、购买域名/付费资源、部署或远程推送。另行明确批准根.env程序加载用于数据库迁移与真实DB/替身测试。没有查看/打印实际.env或凭据。0006只新增email_deliveries、外键、索引、唯一/状态约束并启用RLS，实际迁移成功，无清空/删除/重置。

固定安装Resend官方SDK6.37.0，npm元数据要求Node>=20；当前Node24兼容，严格类型和构建验证。SDK引入postal-mime/standardwebhooks传递依赖；无全局安装、资源开通或供应商账号操作。Marketplace技能要求的自动配置资源与用户明确权限边界冲突，遵循用户要求直接集成已指定Resend，不执行Marketplace配置。React检查采用既有react-best-practices技能核对请求取消、轮询清理、受控确认和文本渲染，不引入UI库。

## 实现与主要文件

- shared/email.ts：发送确认、配置/历史/状态契约；shared/meetings.ts兼容派生发送状态。
- apps/api/src/email/provider.ts：官方SDK轻量适配器，固定https://api.resend.com；发件域名/受限测试校验、一次send、只读inspect、保守错误分类；不返回供应商原始错误文本。
- apps/api/src/email/service.ts、routes.ts：冻结版本入队、全局业务去重、范围过滤、一次尝试屏障、未知状态和人工核查、只读状态更新。
- db/schema.ts、drizzle/0006*：新增发送记录。scope/configIdentity隔离worker；不因切换scope绕过全局draftId/version去重。
- meetings/service.ts：草稿编辑/确认锁顺序统一为meeting→draft，避免重分析校验竞态；有待发送/处理中/未知结果时阻止编辑绕过；detail按当前版本真实发送记录派生deliveryState。原数据库draft.delivery_state保留历史占位not_sent，不再作为发送事实来源。
- app.ts/config/env.ts：后端配置与默认关闭开关；仅进程内工厂依赖注入供隔离测试，无生产HTTP或环境变量mock供应商开关。
- EmailDeliveryPanel.tsx、MeetingPanel.tsx、App.tsx：保存版本预览、单独最终确认、收件人/正文、异步历史/接受与投递区分、错误与未知人工核查。
- tests/unit/email.test.ts、tests/integration/email.test.ts、tests/email-stub/delivery.spec.ts、tests/support/email-server.ts、playwright.email-stub.config.ts：分层测试。浏览器替身测试是专用进程入口，所有其他外部适配器禁用，记录明确使用STUB标识。
- scripts/e2e.mjs：默认和其他live测试强制关闭真实邮件，专用--email-stub才启用注入的替身。README/SPEC/TASKS和.env.example更新；没有修改docs/assignment.txt。

## 发送与两层幂等

旧/confirm仅保存确认版本，不创建发送任务。独立POST/send要求严格{version,confirmSend:true}；UI还要求预览、勾选和点击最终确认。事务锁meeting/draft，检查确认状态、版本、当前分析、确认快照、白名单，冻结from/to/subject/body/version/analysis，存hash和请求追踪。编辑后版本递增且state回draft，旧确认不能用于新版。

永久unique(draftId,version)和稳定contextpilot/email/<draftUUID>/v<version>键阻止并发/重复业务任务。Resend Idempotency-Key只提供24小时内的第二层保护，应用绝不依赖其永久去重。正文采用text，不解释来源中的HTML/命令；增加X-ContextPilot-Delivery头辅助核查。收件人精确匹配白名单，仅域名忽略大小写，保留本地部分大小写，避免将可能不同邮箱当作同一地址。

worker用现有轮询runner和FOR UPDATE SKIP LOCKED领取queued；再次校验白名单/冻结内容hash/版本/会议分析/确认，再提交processing、token、尝试时间和5分钟租约，之后才调用一次HTTP。邮件任务不做processing接管：过期转unknown，永不自动再次send。预检失败可明确failed而不调用send；请求超时、网络、5xx、模糊409或返回格式错误均unknown。供应商明确拒绝才failed。旧worker迟到的原始响应可以凭token解析自身unknown，但不能制造新尝试。

请求被接受后数据库写入失败时，尽可能保留供应商ID并记unknown；数据库持续不可用则保留processing，后续过期unknown，不重发。崩溃发生在尝试屏障提交后、HTTP之前，也可能保守地成为unknown但实际未发；这是优先避免重复的取舍，不保证自动最终送达。没有自动/人工重试unknown接口；缺ID时要求人工对照时间、收件人、主题和记录/请求ID到控制台核查，阻止编辑成新版本绕过。

queued/processing/accepted/delivered/failed/unknown分别持久化，供应商ID/事件/请求ID/安全错误码与本地时间记录。刷新供应商状态只GET已知邮件ID，CAS防止较旧并发查询覆盖新结果，查询失败保留原状态。accepted不是送达；delivered仅是供应商报告对端邮件服务器接受，不保证出现在收件箱。未部署webhook，用户可显式只读核查。

## 已执行测试（无真实发信）

### 离线/Mock

npm run check：73项单元/API/兼容测试通过，严格类型和双构建通过。新增邮件测试覆盖明确确认、白名单/大小写规则、快照/hash、真实SDK调用形状与稳定幂等头、网络只调用一次、供应商拒绝、5xx/409/错误成功响应unknown、测试模式限制、域名预检只读。默认缺配置明确503/disabled，不伪造成功。

默认npm run test:e2e：1 passed（1.8秒）；npm run test:e2e:production：1 passed（1.5秒）。真实浏览器/本地服务健康检查，不调用业务外部服务。

### 真实PostgreSQL，邮件/LLM/Storage/Embedding替身

首轮 npm run test:integration -- tests/integration/email.test.ts：4 passed（118.82秒）。覆盖未确认/编辑旧确认/白名单/未启用拒绝、两个连接池并发确认与提交、唯一记录和冻结正文、活跃尝试租约过期不二发、迟到原始响应、同版本再点击/重启与超24小时窗口无二发、未知人工核查、供应商拒绝和作用域隔离。

扩展后全套 npm run test:integration：19项中17通过，chat和worker-isolation各1项因既有5000ms数据库连接建立超时失败，未修改业务超时/连接池或自动重试。邮件新增第5项（发信前版本失效不调用provider）、记忆4项、会议2项和PDF4项均通过。保留失败，针对两个文件手动复验：chat+worker-isolation共4项全部通过（54.21秒）。因此19个不同用例均取得通过证据，但不宣称整套首轮全绿。不能宣称该次全套一次全绿。

### 真实浏览器/API/DB，邮件供应商明确替身

RUN_LIVE_TESTS=1 node scripts/e2e.mjs --email-stub：4 passed（1.5分钟）。覆盖未确认禁发、保存编辑后确认、冻结正文预览、供应商失败码显示、重复请求同一ID且替身send计数1、超时unknown/禁重发、accepted与delivered分离、状态核查/刷新恢复、非白名单HTTP错误前端真实显示且没有发送记录。

首轮3项中2项通过，另一项业务断言和重复保护已过，但测试计数端点未使用Vite /api代理而返回HTML导致JSON解析失败。只修改专用测试路径至/api/test/email-calls后重跑通过；该端点只存在于专用替身测试入口，不进入生产app。UI补充了入队成功立即显示queued记录和稳定记录ID后，再次4项全部通过（1.6分钟）。

上述accepted/delivered均为STUB结果，不是Resend真实记录。当前真实发送=0封，真实送达=未验证。没有运行收费LLM/Embedding，也没有真实Storage调用。测试数据保留，不删除原用户数据。

## 真实Resend配置与待用户操作

后台变量详见.env.example/README：EMAIL_DELIVERY_ENABLED（默认false）、RESEND_API_KEY、EMAIL_FROM、EMAIL_ALLOWED_RECIPIENTS、EMAIL_MODE、EMAIL_TEST_ACCOUNT_ADDRESS、RESEND_DOMAIN_ID、EMAIL_SCOPE。不要向聊天粘贴密钥。

当前账号实际域名、API Key权限、额度/生产审批状态尚未核查，不能因配置Key就声称能发信。按官方文档：

- 自有发件域名须控制台添加、DNS验证且sending启用；verified模式服务端每次只读检查域名ID/名称/状态/能力，Key须能查询域名。
- 受限test模式from=onboarding@resend.dev，收件人/白名单只能是Resend注册邮箱；本实现不放宽到任意地址。账号是否允许仍须用户控制台确认，再经获批真实调用验证。
- Key须支持发送及邮件状态查询；若只有sending权限导致状态GET失败，不能将此当已送达，需控制台核查或提供可查询权限。不要为测试购买资源/域名或自动提升套餐。
- Resend提供delivered@resend.dev等模拟事件地址，会计入发送额度；模拟投递不等同真实收件箱。本轮没有发送模拟或真实邮件。

计划最多2封真实测试，均仅发往用户控制且在精确白名单内的邮箱：一封确认版本后发送并验证重复点击不二发；另一封仅在明确授权内验证修改后新版本重新确认。用户需先在控制台核实发件方式/账号限制/剩余额度、创建适当权限的Key、配置根.env但保持开关false，再明确授权封数与收件人范围。获得授权后才启用真实worker/点击发送，并记录ResendID、accepted/delivered/失败/未知与用户收件箱核对结果。无授权不执行，不创建Phase6完成提交。

官方依据：[SDK发信](https://resend.com/docs/api-reference/emails/send-email)、[幂等24小时](https://resend.com/changelog/idempotency-keys)、[取回发送状态](https://resend.com/docs/api-reference/emails/retrieve-email)、[resend.dev限制](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)、[域名验证](https://resend.com/docs/dashboard/domains/introduction)、[模拟事件地址](https://resend.com/docs/dashboard/emails/send-test-emails)、[账号额度](https://resend.com/docs/knowledge-base/account-quotas-and-limits)。

## 保留事项

Phase3偶发上传HTTP500继续OPEN，无根因修复证据。原PDF和记忆仍是保守引用式回答；公开工作区鉴权尚未完成，不能公网部署。本阶段未实现搜索/PPT，不推送，不部署，不创建付费资源，不发真实邮件。真正业务验收和最终Git提交均等待后续授权与验证。

## 离线交付时的关口（历史）

代码及本轮允许的测试工作已完成：73项离线测试/严格类型/双构建，数据库19个不同用例分批通过，真实浏览器+数据库+替身邮件4项通过，默认开发/生产浏览器各1通过。初次数据库整套17/19的两项5秒建连超时经针对复验通过，失败保留；没有为此改连接池或增加自动重试。代码保持原任务隔离修复，Phase3 HTTP500仍OPEN。

运行时SDK/数据库配置和用户账号尚未被当作真实邮件验收。真实邮件发送数量0；供应商真实MessageID与投递/收件箱结果均未验证。真实模型/Embedding/Storage回归本轮未调用，只有已说明的离线与数据库替身回归；不借用Phase5费用授权。

Phase6真实服务验收与本地完成commit仍待用户配置并明确批准最多2封真实测试邮件，届时先只读检查账号/域名权限与白名单、确认内容版本，再按独立UI确认发送并核查实际状态。此次不Git提交，不推送/部署，不进入下一模块。

## 受限真实验收：配置预检未通过（2026-11-04）

用户已授权仅onboarding@resend.dev向EMAIL_TEST_ACCOUNT_ADDRESS发信，最多2封；第一封须供应商结果明确且用户检查收件箱后才可发第二封。实际尚未消耗发送额度。

程序通过dotenv解析根.env，未打印密钥或实际收件人。校验通过：EMAIL_MODE=test、指定发件人、单一白名单且与账号邮箱配置一致、Key非空。根.env中的EMAIL_DELIVERY_ENABLED已设置/恢复false；没有启动开启发送的进程。只读进程检查未发现本项目API后台进程。

只读GET https://api.resend.com/emails?limit=1返回HTTP401，预检未通过。响应正文未保存，不能断言是无效Key还是Key读取权限受限，也不能由此断言发送权限有效。未进行发信POST、未重试发送、未创建本轮发送任务或真实邮件数据；Resend Message ID无、真实发送0、供应商接受/送达均未验证、无需收件人检查本轮新邮件。非秘密预检证据在被忽略的.acceptance/phase6-preflight.json。

等待用户在Resend控制台核实账号/API Key及邮件读取权限，必要时自行更新根.env后再继续只读预检。本次未完成业务验收，不创建Phase6完成提交。不进入下一阶段。

## 受限真实验收：第一封已被供应商接受，等待用户收件确认

用户核实控制台Key为Full access/All domains后再次授权一次只读预检。重新从根.env解析配置，GET /emails?limit=1实际HTTP200，错误类型/信息均为空。不能仅据此证明发送权限，随后按已授权边界验证实际第一封。

根.env始终为EMAIL_DELIVERY_ENABLED=false，只在隔离进程中将开关覆盖为true，使用独立EMAIL_SCOPE；LLM/Embedding/Storage凭据在该进程禁用。调用真实Resend官方SDK，HTTP守卫只允许onboarding@resend.dev向唯一配置账号邮箱发送一次POST /emails，记录开始屏障后拒绝二次外部发送。使用真实数据库中明确标记的验收草稿与人工构造的会议关联夹具，没有伪称调用会议分析模型。通过生产Fastify确认/发送路由进行进程内HTTP注入测试，并非浏览器点击证据。

- 邮件主题：ContextPilot Phase 6 验收邮件 1/2。
- Resend Message ID：01a1a5b7-4a15-7e6a-8d27-a9aab90e5dbf。
- 发送记录ID：8153ba36-963f-45dc-9963-5752a2c401cc；草稿81988b2f-668a-4776-bcef-c41adb22d63d，版本1。
- 实际外部发送POST：1次，HTTP200。两次并发版本确认、两次并发发送提交以及一次再次提交均对应同一发送记录，没有二次外部发信。
- 数据库状态accepted；只读查询供应商last_event=sent。尚未取得delivered或收件箱到达证据，不能将accepted/sent当成已送达。
- 收件情况等待用户检查。第二封未创建/发送，须第一封成功并由用户确认后才继续新版本。
- 隔离进程已关闭，根.env开关已再次验证false，无重试或异常。脱敏证据在.acceptance/phase6-preflight.json、phase6-first-attempt.json。

Phase6仍未完成最终业务验收，不Git提交，不进入下一模块。

## 第二封：新版本已发送，供应商报告delivered

用户明确确认第一封已收到，满足逐封验收条件。只读刷新第一封后供应商事件为delivered，数据库同步为delivered。

复用同一草稿81988b2f-668a-4776-bcef-c41adb22d63d，经生产PATCH路由保存v2。未重新确认时/send(v2)返回409，/confirm(v1)返回409，且外部send计数为0；随后两次并发确认v2、两次并发/send(v2)、再次提交均关联唯一v2发送记录，实际外部POST只有1次。内容为明确的第2封验收说明，无其他业务通知、收件人或服务调用。

- 主题：ContextPilot Phase 6 验收邮件 2/2。
- Resend Message ID：01a1a5b9-9c42-73c4-b777-b6278d27c646。
- 发送记录ID：4e73b565-df88-4864-a453-b7529be16737，草稿版本2。
- 外部HTTP200，数据库delivered，供应商last_event=delivered。
- 第二封用户收件箱核对仍待确认；不能以对端邮件服务器接受替代收件箱实际位置证据。

累计真实发送2/2封，均使用onboarding@resend.dev与唯一配置账号邮箱。没有剩余发送额度，不再发信。第二个隔离进程关闭，根.env的EMAIL_DELIVERY_ENABLED再次验证为false。证据.acceptance/phase6-second-attempt.json；首封收件证据已标记user_confirmed_received。

第一次生成第二封本地验收脚本因Python默认GBK读取UTF-8记录失败，脚本未生成、Node未进入发送流程；显式UTF-8后执行成功。这是本地准备错误，无发信HTTP重试或额外邮件。

等待用户确认第二封收件，然后更新最终文档并创建Phase6本地提交；不进入下一阶段。

## 最终验收结论

用户已确认第2封实际收到。第1封MessageID为01a1a5b7-4a15-7e6a-8d27-a9aab90e5dbf，第2封为01a1a5b9-9c42-73c4-b777-b6278d27c646；均为数据库delivered、供应商delivered，并有用户独立收件确认。新连接只读数据库审计验证同一草稿仅2条发送记录(v1/v2)、ID与证据一致；两次外部发送总数2/2、根.env开关false。未追加发信/模型/Embedding/Storage调用。

最终检查沿用已验证的73项离线测试/严格类型/双构建、19个不同真实DB/替身用例分批通过、4项浏览器+真实DB+替身邮件用例、默认开发/生产E2E。实际邮件流程经生产Fastify路由的进程内HTTP注入测试，不冒称真实供应商浏览器点击验收；浏览器行为由明确替身测试单独证明。

真实业务验收现已全部通过，可创建Phase6本地提交。没有部署/推送/购买资源/使用其他收件人，不进入搜索/PPT或下一阶段。后续新邮件须另行授权；Phase3上传HTTP500继续OPEN。所有之前“等待/禁止完成提交”的描述均为当时权限与进度的历史记录。
