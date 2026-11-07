# 真实邮件上线检查与一次收件验收

本轮仅检查/修复代码，不读取真实环境变量或凭据，不修改 Railway，不发送邮件。公网现有配置尚未由本轮独立核实。当前线上仍为关闭状态（用户报告）。

## 代码审查结论

| 保护 | 实现证据 | 判断与验证 |
| --- | --- | --- |
| 发件配置 | apps/api/src/email/provider.ts | Resend官方SDK，后端RESEND_API_KEY、EMAIL_FROM；固定官方API地址 |
| 白名单 | email/service.ts validateRecipients | 服务端精确邮箱白名单，入队及Worker实际发送前均检查；最多10个收件人，不支持通配符；域名不区分大小写，本地部分保留大小写 |
| 用户确认 | shared/email.ts；meetings/service.ts；email/service.ts | 请求须confirmSend=true，当前草稿已确认且版本/冻结快照/分析/待办仍匹配；资料和模型没有发送工具 |
| 幂等 | db/schema.ts；email/service.ts | draftId/version唯一索引、事务行锁与二次去重、稳定供应商幂等键；同版本只一条记录。processing不自动重领；unknown须人工核查 |
| 数量 | email/service.ts reserveEmailSlot | 新增事务级全局advisory lock；滚动小时全表最多5个新发送任务，失败/未知也计数，重启/改scope不重置。重复版本在配额检查前返回旧记录；事务回滚不消耗额度 |
| 频率 | demo/access.ts | 受口令保护的API写操作默认每进程每分钟20次；新配额进一步约束邮件任务。5任务可能每个含10个白名单收件人，故不是5个收件人的限制；单收件箱演示将白名单限制为一个地址 |
| 失败诚实 | email/provider.ts；EmailDeliveryPanel.tsx | rejected→failed，不确定→unknown；accepted与delivered有不同文案，均不证明收件箱实际收到 |

修复前生产模式无条件拒绝EMAIL_DELIVERY_ENABLED=true，不能直接改开关。此轮改为显式开启时要求基础配置齐备；默认仍false，Worker发送前继续执行模式/发件域验证。**须由用户最终验收并另行发布此本地提交后再开启开关，不能在旧部署上直接切true。** 不新增迁移、依赖或UI。

5个任务/小时是Demo数量保护，不是账单配额或严格的发送时刻速率：它限制任务创建时间，积压任务恢复时可能集中处理。不要积压大量queued任务，不通过删除发送记录绕过上限。

## Railway 配置步骤（由用户完成）

1. 在 believable-bravery → perceptive-spirit → Variables 中检查现有后端变量。不要在聊天、截图或日志中暴露真实值，不使用VITE_前缀。
2. 保持EMAIL_DELIVERY_ENABLED=false，先核查没有历史queued任务；**打开开关会让Worker处理当前EMAIL_SCOPE/发件配置匹配的既有队列**。有未知历史任务时停止，先人工核查，不在本轮删除记录。确认仅运行一个服务。
3. 配置RESEND_API_KEY（发送、邮件状态读取；verified模式还要域名读取权限）、EMAIL_FROM、EMAIL_ALLOWED_RECIPIENTS（英文逗号分隔）、EMAIL_MODE及稳定的EMAIL_SCOPE（默认demo）。账号额度/权限由用户在Resend控制台核实。
4. 受限账号测试：EMAIL_MODE=test，EMAIL_FROM=onboarding@resend.dev，EMAIL_TEST_ACCOUNT_ADDRESS为用户控制的Resend账号注册邮箱，白名单仅含该邮箱。其他收件箱不可用此模式。
5. 自有域名：EMAIL_MODE=verified，EMAIL_FROM是已验证域名内的纯邮箱地址，RESEND_DOMAIN_ID为对应域名ID，域名sending必须enabled；只允许已授权白名单地址。本轮不购买域名或升级资源。
6. 确认已部署本轮修复版本，准备好一个授权测试收件箱和一次测试；手动设置EMAIL_DELIVERY_ENABLED=true并应用部署。确认服务启动及/api/ready正常，登录后邮件面板显示已配置。基础配置齐全不等于账号权限有效，实际发件前服务端会再次检查。

## 一次真实验收

按 [T03](../demo/acceptance-checklist.md) 用合成meeting.txt生成会议、人工编辑待办；填写获授权的测试邮箱；保存草稿→确认当前版本→展开冻结预览→勾选→单独点击确认发送一次。模型分析/保存/版本确认均不应自动发信。

记录任务ID、版本、Resend ID、事件和时间。点击“核查供应商状态（不重发）”；由用户亲自在收件箱打开邮件，核对主题、收件时间、冻结正文（含人工待办）。供应商accepted、delivered或模拟邮箱事件都不能替代真实收件确认。

结果模板：`版本____；delivery ID____；供应商事件____；收件箱实际收到：是/否；正文一致：是/否；确认时间____`。真实邮箱地址不放进公开仓库。未收到应记BLOCKED/FAIL，先查垃圾箱及Resend；unknown不重发。

验收后由用户决定是否保持开启；公开面试期间若无持续授权，恢复false并应用部署。关闭不撤回已发出的邮件，queued记录保留，未来重新开启前须核查。面试官没有收件箱授权则停在草稿预览，不自行发送。

历史两封收件确认见 [Phase6报告](phase-6-verification.md)；它们不证明本轮部署和新配额已通过真实收件验收。
