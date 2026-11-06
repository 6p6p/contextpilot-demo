# Stage B人工验收第一轮缺陷修复

MVP v1.3最终两项修复及聊天原生PPT复测步骤见[最新记录](mvp-v1.3-verification.md)。真实搜索/模型未获新授权，未把替身结果当Live通过。

第二轮用户结果及MVP v1.2修复已另记[最终复测准备](mvp-v1.2-verification.md)：实际搜索缺失证据、PPT工作流、表格、会议归档/议题和PDF范围。旧记录保留；真实模型复测不能用新离线测试替代。

后续MVP v1.1业务质量与UI/UX v2已按独立阶段完成，见[最新验收记录](mvp-v1.1-verification.md)。此处保留第一轮问题及当时证据，不将后续Mock/DB通过冒充真实人工复测。

2026-11-06，沿用Run ID `cee51f13-79e6-42d6-9caa-dc21b81cf079`与原始问题，Corpus v1 Golden/SHA未改。没有真实模型/Embedding/Tavily/Resend/云Storage调用，未改既有数据/Schema/.env/生产配置，未清理验收资料。

## 实证与限制

按Run标记定位会话后只读查询其精确conversation/message IDs：2会话、16消息，1个LLM_INVALID_RESPONSE（PDF=false/search=off）、2个SEARCH_INVALID_CITATION（required），6条消息开启PDF。8个关联记忆任务全部ready，10条记忆事实均有本轮来源。ID/来源/观察时间明细在忽略目录`.acceptance/stage-b-round1/readonly.json`，不提交用户数据。初次内联只读诊断遭PowerShell参数插值导致SQL42601；改用固定脚本后查询成功，无数据库写入。

**旧实现只保存错误码，没有保存原始模型失败响应或选择JSON。无法还原实际finish_reason、错误引文或来源ID，因此本轮不能宣称已经唯一确定两种错误的实际供应商触发原因。** 修复针对可复现的协议缺陷，真实失败是否消除仍需人工复测，不用Mock成功冒充Live。

## BUG-01 多轮

已排除“第二轮开启PDF”的路由误操作：实际错误记录PDF=false/off。buildContext保留当前会话的completed用户/助手顺序，失败消息不入上下文，现有固定回归未发现上下文丢失。

可复现缺陷：adapter先要求非空content，之后才检查截断；reasoning-only、content空、finish_reason=length被错归LLM_INVALID_RESPONSE。记忆选择器是JSON协议，却未显式设置JSON模式/输出预算/non-thinking（普通聊天默认1024），与网页选择器不一致。

修复：先识别空输出/结构化截断，返回LLM_OUTPUT_TRUNCATED，不将reasoning_content当回答；记忆选择器显式JSON、4096上限、DeepSeek non-thinking，引用ID/事实来源校验不放宽。普通聊天的模型/默认预算/非空非结构化截断兼容行为保持原样，不通过全局提高额度来掩盖错误。新增允许字段日志仅含形状/长度/布尔值，不保存原始文本；聊天路由用请求ID+错误码记录失败。

前→后：固定空推理响应原先INVALID_RESPONSE，现为明确TRUNCATED；选择器请求参数回归通过。真实原问题第二轮成功：**待人工复测**。若仍失败，新日志可区分截断/空形状，不能无预算自动重试。

## BUG-02 联网引用

可确认的协议薄弱点：模型自行逐字抄写引文，任何改写/错ID/不符合JSON都会归同一错误；官方过滤之前发生在模型选择之后，模型仍会看到不合规网页。未发现服务端排序时重编号，原W ID一直保留；不能无证据指责ID映射损坏。

修复：官方要求下先筛选可选证据；为实际摘要生成<=800字符原文选项，让模型只选真实id+quoteIndex，由服务端取原文并再次核对。来源ID不依赖排序位置、不重新编号；兼容旧quote协议时仍要求逐字包含。越界索引、伪造ID、改写quote继续失败关闭，不自动补字、换URL或忽略不合法引用。时效/新旧官方冲突/当前结论门禁保留；原始全部检索元数据仍持久化。新增日志仅输出错误类别和结果数。

前→后：新固定索引协议原先被拒绝，现可选取冻结W2真实摘要；未知ID/索引/改写依旧拒绝。已有T06时效和官方域名跨机构回归保持通过。它修复抄写协议风险，**不证明历史失败一定由标点差异引起**。真实required查询成功：待人工复测，0次追加Tavily。

## BUG-03 记忆

路由确认：knowledgeMode=true优先调用PDF answerer，不执行memory.retrieve；search=off关闭实时搜索，knowledgeMode=false才进入正常记忆路径。这与人工截图的“证据不足”相符，但不等于记忆未提取。实际8任务ready/10事实来源有效。

不改长期记忆架构；前端开启PDF时明确提示“仅检索PDF，不召回长期记忆”。受控数据库T05新增一个真正新建的合成会话，以PDF=false/search=off验证3条记忆召回/来源，再开启PDF验证拒答且未多调用memory.retrieve。使用真实PostgreSQL、模型/Embedding/Storage替身，不能代替本轮真实模型新会话复测。刷新记忆状态反馈记录于UX backlog，未扩展为全面重构。

人工复测：新建会话，关闭PDF、关闭联网，再输入指南recall。核对南京/2026-11-06/ORCHID-7421与来源ID，ORCHID-FIN苏州事实不能合并。未知/冲突保留来源差异。

## BUG-04 PPT第二口令

后端createPresentationAuth.require早已允许有效全站Demo Cookie；聊天生成/任务/下载均调用服务端鉴权，未发现需要第二口令的后端规则。前端却自行再请求demo-session，独立的初始false/请求失败可在已登录时显示旧口令表单。

改为消费DemoAccess已验证的React Context，去掉子组件重复探测；不依赖PPT列表请求成功才能识别全站登录。未配置全站认证的本地模式保留原PPT口令后端保护，不把“全站未配置”误当“已认证”。未改服务器权限/Storage公开性。生产E2E注入冗余探测故障验证已登录无需二次口令，未授权API/下载401保持通过。真实PPT生成/下载仍待人工复测。

## BUG-05 草稿入口

已有MeetingPanel→选会议→detail.draft→DraftEditor接线；服务仅在完成风险分析且有风险时准备草稿。没有证据表明缺少独立邮件系统或必须改后端生成条件。

在所选会议详情顶部增加“查看邮件草稿（确认不发送）”锚点；没有草稿时解释“完成分析且识别风险”的条件。生产浏览器UI fixture验证可定位草稿、空收件人确认禁用、真实发送禁用；fixture不作为用户实际会议分析成功证据。选择真实完成会议后的草稿内容/版本确认待人工复测，EMAIL_DELIVERY_ENABLED=false守卫保留，发送0。

## 测试/新增数据

- 先新增4项协议回归：初跑3 FAIL/1 PASS，明确复现后修改；后补1项日志不泄露内容测试，共5项新测试。
- npm run check与单独npm run test：186项、18文件通过，类型和双构建通过。
- 本地生产Chrome E2E：2项通过；包含既有后端401边界、全站登录无PPT二次口令、草稿UI fixture。初次新fixture错误拦截导航后的父认证请求导致1 FAIL，收窄故障注入到初始挂载后重跑2 PASS，非产品权限放宽。
- 受控数据库Corpus完整T01–T08：见下方最终Run回执。全部外部依赖替身，只新增独立合成对象、不修改Stage A/Stage B历史记录；继续保留Manifest和本地Storage替身文件，无清理。
- React技能检查：Context只有认证布尔值，无口令持久化；无条件Hook，移除冗余请求；提示使用status，草稿入口原生锚点；不引入UI/设计框架。

UX v2六项见[backlog](ux-backlog.md)。人工复测从[原指南](corpus-stage-b-manual.md)继续：先关闭PDF/搜索测试多轮与记忆，再只做一次required搜索；费用授权与账单仍独立，不默认启用真实调用。全部现场成功项尚未确认前，不关闭Stage B。

最终数据库Run：`b9261bfb-cc22-459b-aa9d-25fb786318b8`，8项PASS、183.10秒。新增66记录（4会话/32消息/3PDF/6chunk/2会议/2分析/2风险/2证据/3待办/1草稿/1确认/4记忆任务/3记忆/1PPT任务/0发送），7个本地Storage替身对象。首尾旧记录哈希变化0，实际云Storage/模型/Embedding/Tavily/Resend调用各0。Manifest位于`.acceptance/corpus-stage-a/<RunID>/manifest.json`，独立进程恢复receipt同目录。未运行清理，没有修改原Stage A或人工Stage B资料。此轮只读原Stage B检查不计入新增记录数。

真实成功待确认：原第二轮问题、原required搜索、实际记忆新会话、实际会议草稿/确认、真实PPT使用单次全站认证。本轮没有重新生成真实业务PPT，不将STUB规划或浏览器fixture计为Live。用户此前人工调用的费用未提供，不能把本轮代理0调用理解为Stage B总费用0；继续前应确认用量与授权。
