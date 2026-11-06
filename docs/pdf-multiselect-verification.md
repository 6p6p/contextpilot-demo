# PDF 多选下拉框小修复

2026-11-07。仅修改前端选择交互；后端、Schema、document IDs、RAG/PPT资料语义和会议单选不变。无新增依赖、真实API调用、云数据库读写、清理、Push或部署。

原问题：`ChatAttachments` 在加号浮层内直接渲染全部PDF，长列表推远会议及设置入口。

修改：

- 新增 `apps/web/src/PdfMultiSelect.tsx`：默认显示“选择 PDF（可多选）”或“已选择 N 份 PDF”；展开后文件名实时过滤、复选框、清空选择、状态与不可用项禁用；列表最大260px，仅列表内部滚动。
- `ChatAttachments.tsx` 仅替换原PDF列表，仍读写原 `presentationContext.documentIds`；关闭、搜索和过滤不修改选择。现有附件标签及会议单选保留。不可用的已选文件仍可通过附件标签或清空选择移除。
- `Popover.tsx` 通过父浮层ID识别嵌套门户，保证操作PDF不会误关加号菜单，点击外部关闭对应层、Escape只关闭最内层并返回焦点。清空使按钮禁用、焦点离开控件时也可Escape关闭。不重挂附件组件，保留异步上传的会话作用域保护。
- `workspace-v2.css` 只新增下拉框及列表局部样式。既有菜单、历史操作、页面布局不变。
- 两份E2E仅更新PDF选择入口，并新增45份PDF的确定性UI场景；Golden Dataset未改。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run check` | PASS：类型检查、258项单元/API测试、生产API/Web构建 |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e:production` | PASS：7/7，6.8秒 |
| 桌面1440px、手机390px真实Chrome截图复核 | PASS：子浮层在视口内，无横向溢出，会议/设置保持紧凑位置 |
| 0/1/多选，文件名过滤及清除过滤后仍选中 | PASS |
| 取消勾选、清空、关闭/重开、附件标签移除后的计数 | PASS |
| 45项列表内部滚动、不可用PDF禁用 | PASS |
| 外部点击、嵌套Escape、键盘焦点 | PASS |
| 聊天请求的documentIds和presentationContext.documentIds完全匹配所选UUID | PASS；真实浏览器请求，API响应为合成fixture |
| 原PPT空附件/综合附件、进度/失败/下载与刷新，PDF范围、会议单选、异步附件会话隔离、其余UI回归 | PASS；复用原浏览器用例 |
| 新真实模型/PPT/数据库业务验收 | NOT_RUN：本轮纯UI，不使用替身结果冒充Live业务通过 |

首轮测试暴露的文字箭头断言问题已改为SVG；清空后失焦时Escape无响应已按最内层关闭规则修复。一次测试误用会议原生select的Escape（只关闭系统选项层），改为点击父菜单设置区域验证PDF外部关闭，不改会议交互。

首轮既有超大TXT上传断言出现一次 `ECONNRESET`，未修改上传或放宽限制；最终完整运行该用例通过（返回413），无自动重试。它不是已复现的Phase3 HTTP500；后者继续作为既有观察项。

截图保留于忽略目录 `.acceptance/pdf-multiselect/pdf-multi-1440.png` 和 `pdf-multi-390.png`，均为合成资料。不存在已知阻塞性UI问题；未新增跨浏览器/实体手机专项验收。

更新README/SPEC/TASKS后创建本地提交并停止。
