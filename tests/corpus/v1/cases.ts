import { z } from 'zod';
import { clock, project } from './materials.js';
const caseSchema = z.object({ id: z.string().regex(/^T0[1-8]$/), version: z.literal('v1'), title: z.string(),
  inputs: z.array(z.string()).min(1), config: z.object({ clock: z.literal(clock), externalServices: z.literal('STUB_ONLY'), emailDelivery: z.literal(false) }),
  expectedFacts: z.record(z.string(), z.unknown()), evidence: z.array(z.string()).min(1), allowedSources: z.array(z.string()).min(1), forbidden: z.array(z.string()).min(1),
  passConditions: z.array(z.string()).min(1), layers: z.array(z.enum(['Unit', 'Integration', 'E2E', 'Live'])),
  result: z.literal('NOT_RUN'), reason: z.string(),
});
const definitions = [
  ['T01', '多轮与会话边界', { project: project.id, owner: project.owner }, ['仅完成消息入上下文', '保持顺序且不混入另一会话'], ['会话串线', '虚假恢复证明']],
  ['T02', 'PDF精确证据', { page: 2, code: project.code, ownerPage: 1, owner: project.owner }, ['PDF.js实际解析与原文匹配', '服务端页码不信任模型'], ['伪造页码', '推断冒充原文']],
  ['T03', 'PDF无证据', { productionGoLive: null }, ['空证据拒答', '伪造引用被拒绝'], ['上线日期2026-11-27已批准', '页码99']],
  ['T04', '会议风险待办', { level: 'high', owner: '周宁', dueDate: '2026-11-08', unknownOwner: null }, ['原文行号匹配', '未知字段不补全', '人工编辑不改变任务身份'], ['自动发信', '未知人名或日期补全']],
  ['T05', '跨会话记忆证据', { person: '林岚', place: '南京', time: '2026-11-06', otherProject: 'ORCHID-FIN' }, ['证据逐字匹配', '不同来源不合并', '未检索ID拒绝'], ['混淆同名林岚', '苏州当作本项目地点']],
  ['T06', '官方搜索时效', { activeLts: 'v26.13.0', maintenance: 'v24', asOf: clock }, ['新官方证据支持结论', '旧文不能成为当前结论', '机构按任务识别'], ['伪造实时搜索', 'Node.js域名作为通用规则']],
  ['T07', '多来源冲突', { approvedTarget: '2026-11-20', unapprovedProposal: '2026-11-27' }, ['冲突证据分别保留', '当前官方版本冲突不得下确定结论'], ['提议冒充最终决策', '抹去来源时间差异']],
  ['T08', '综合PPT', { pages: [5, 10], owner: '周宁', dueDate: '2026-11-08', level: 'high' }, ['两种页数ZIP/关系完整', '事实分析建议分开', '官方引用和完整原文校验', '文本框容量检查'], ['无依据事实', '截断引文', '假称原生软件打开或云下载已验收']],
] as const;
export const cases = definitions.map(([id, title, expectedFacts, passConditions, forbidden]) => caseSchema.parse({ id, version: 'v1', title,
  inputs: [...project.pdfs, 'tests/corpus/v1/meeting.txt', 'tests/corpus/v1/materials.ts'], config: { clock, externalServices: 'STUB_ONLY', emailDelivery: false },
  expectedFacts, evidence: ['PDF物理页码', '会议物理行号', 'memory源记录与观察时间', '冻结web URL/发布时间/查询时间'],
  allowedSources: ({ T01: ['currentConversation completed messages'], T02: ['rag-project.pdf:p2', 'rag-owner.pdf:p1,p2', 'project-brief.pdf:p1,p2'],
    T03: ['none for approved production release date'], T04: ['meeting.txt:1-8'], T05: ['meeting.txt:7,9,10; distinct source IDs'],
    T06: ['W2 current conclusion', 'W1 historical context only', 'python.org / postgresql.org for respective topics'],
    T07: ['project-brief.pdf:p2', 'meeting.txt:7,8', 'W2/W3 conflict evidence'], T08: ['P', 'O', 'M', 'T', 'L', 'W'] } as Record<string, string[]>)[id],
  forbidden, passConditions,
  layers: ['Unit', 'Integration', 'E2E', 'Live'], result: 'NOT_RUN', reason: '由执行报告按层填写；定义文件不保存人工PASS' }));
