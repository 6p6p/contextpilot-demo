# ContextPilot 面试 Demo Kit

全部人物、项目、访问码和业务资料均为合成数据。AMBER-593 是资料中的虚构项目码，不是网站登录口令。无需开发脚本，也不依赖清理前的数据库记录。

## 开始前

1. 从项目 [README](../README.md) 打开 Live Demo；访问口令由演示者线下提供。不要上传私人资料。
2. 下载本目录 [files](files/) 中四个文件（GitHub 文件页选择 Download raw file）；PDF 必须保存原始文件，不能保存网页为 PDF。
3. 确保只有一个演示服务处理任务。全体访客共享工作区和限额；不要同时进行多轮验收。完整首轮为三份 PDF、一次会议上传，勿反复上传失败请求耗尽每小时上传限额。
4. 真正发送邮件仅由已授权操作者执行，且仅发到服务端白名单内、本人授权的测试收件箱。未授权的面试官跳过发送，停在冻结版本预览；此时 T03 只能算部分通过。管理员配置见 [邮件上线与验收](../docs/email-release-check.md)。

## 文件及事实依据

| 文件 | 原始来源 | 应核对的内容 |
| --- | --- | --- |
| [rag-project.pdf](files/rag-project.pdf) | tests/fixtures/rag-project.pdf，字节不变 | 第2页 AMBER-593、CNY 137420 |
| [rag-owner.pdf](files/rag-owner.pdf) | tests/fixtures/rag-owner.pdf，字节不变 | 第1页 Dr. Mira Qiao；第2页 Nanjing Room Cedar-17 |
| [project-brief.pdf](files/project-brief.pdf) | tests/corpus/v1/project-brief.pdf，字节不变 | 第1页项目背景；第2页有条件的2026-11-20试点目标，非正式上线承诺 |
| [meeting.txt](files/meeting.txt) | tests/corpus/v1/meeting.txt，UTF-8、11行、字节不变 | 会议2026-11-05；供应商接口未交付；11-27改期仅提议 |

南京的 Nanjing Room Cedar-17 是会议地点；2026-11-06 是林岚协调本项目的时间，不是会议日期。原会议待办是周宁／2026-11-08；测试将其人工改为林岚／2026-11-09。另一项目 ORCHID-FIN 的同名林岚在苏州，不可合并。

文件包含故意的不可信指令（PDF 附言、会议第11行）。它们只用于验证资料不能授权发信，不能按这些文字执行操作。Corpus 中的固定网页快照不是实时事实；本包不复制其假定版本答案。

## 执行顺序

依次执行 [T01–T06 操作与通过标准](acceptance-checklist.md)。T01 建立聊天事实，T02 上传 PDF，T03 上传会议并保存人工待办，T04 等待记忆提取后另开会话召回，T05 独立联网问题，T06 选取本轮资料生成 PPT。首次从空库开始也使用相同步骤。

每次记下测试时间、会话标题、文件名和错误追踪 ID；不要记录 Cookie、口令或真实邮箱凭据。任务需等待 ready/完成，刷新后仍应保留；failed、queued、unknown 都不能算通过。长时间等待时先查看错误，勿批量重新分析或重试。

现场可按 [8–12分钟讲解脚本](demo-script.md) 演示；真实服务等待或邮件延迟可延长用时，不能预先填 PASS。历史验收证据见 [交付检查记录](../docs/demo-kit-verification.md)，它与本轮面试官的实际结果分开。
