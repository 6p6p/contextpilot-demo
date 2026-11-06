import { z } from 'zod';
export const presentationContextSchema = z.object({ meetingId: z.uuid().nullable().default(null), useMemory: z.boolean().default(false), webQuery: z.string().trim().min(1).max(200).nullable().default(null), documentIds:z.array(z.uuid()).max(20).optional(),useChat:z.boolean().optional() }).strict();
export type PresentationContext = z.infer<typeof presentationContextSchema>;
export const pptSourceSchema = z.object({
  id: z.string(), kind: z.enum(['request', 'chat', 'pdf', 'meeting', 'meeting_risk', 'todo', 'memory', 'web']),
  title: z.string().max(300), text: z.string().min(1).max(8000), locator: z.record(z.string(), z.unknown()),
  classification: z.enum(['fact', 'analysis', 'recommendation']).default('fact'),
  owner: z.string().max(100).nullable().optional(), dueDate: z.string().nullable().optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).nullable().optional(),
});
export type PptSource = z.infer<typeof pptSourceSchema>;
const aside = z.string().trim().min(1).max(88).refine(v => !/[\d%％]|已完成|已经|负责人是|截止日期为|风险等级为|预算为|收入为|增长了|明天|昨天|今天|下周|本周|本月|下月|下季度|本季度|星期|周[一二三四五六日天]|[一二三四五六七八九十〇零两]+[年月日天周]|(?:负责人|责任人|牵头人)(?:为|是)|指定.{1,8}(?:负责|牵头)|由.{1,12}(?:负责|完成|执行|组织)/.test(v), '分析或建议不得新增数字、日期或确定的内部事实');
export const pptItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quote'), sourceId: z.string(), quote: z.string().trim().min(1).max(88) }).strict(),
  z.object({ kind: z.literal('analysis'), text: aside, sourceIds: z.array(z.string()).min(1).max(3) }).strict(),
  z.object({ kind: z.literal('recommendation'), text: aside, sourceIds: z.array(z.string()).max(3).default([]) }).strict(),
  z.object({ kind: z.literal('gap'), text: z.enum(['未提供可核实的项目进展', '未提供负责人或明确时间', '现有资料不足以确认风险', '尚无可引用的业务资料', '外部信息未核实', '需要补充原始资料后再判断']) }).strict(),
]);
export const pptSlideSchema = z.object({ kind: z.enum(['cover', 'summary', 'background', 'progress', 'risk', 'todos', 'next', 'gaps', 'references']), items: z.array(pptItemSchema).max(3) }).strict();
export const pptPlanSchema = z.object({ slides: z.array(pptSlideSchema).min(3).max(30) }).strict().superRefine((p,c) => {
  if (p.slides[0]?.kind !== 'cover' || p.slides.at(-1)?.kind !== 'references' || p.slides.filter(s=>s.kind==='cover').length!==1 || p.slides.filter(s=>s.kind==='references').length!==1) c.addIssue({ code: 'custom', message: '封面和参考资料必须分别占第一和最后一页' });
  for (const s of p.slides.slice(1,-1)) if (!s.items.length) c.addIssue({ code: 'custom', message: '内容页不能为空' });
});
export type PptPlan = z.infer<typeof pptPlanSchema>;
export const presentationJobSchema = z.object({ id: z.uuid(), assistantMessageId: z.uuid(), conversationId: z.uuid(), filename: z.string(), pageCount: z.number(), status: z.enum(['queued','planning','rendering','ready','failed']), errorCode: z.string().nullable(), errorMessage: z.string().nullable(), retries: z.number(), size: z.number().nullable(), createdAt: z.string(), updatedAt: z.string() });
export const presentationListSchema = z.object({ presentations: z.array(presentationJobSchema) });
export type PresentationJob = z.infer<typeof presentationJobSchema>;
