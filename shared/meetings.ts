import { z } from 'zod';

export const evidenceSchema = z.object({ startLine: z.number().int().positive(), endLine: z.number().int().positive(), quote: z.string().min(1).max(1500) });
export const factSchema = z.object({ value: z.string().min(1).max(300), evidence: evidenceSchema });
const discussionSchema=factSchema.extend({category:z.enum(['topic','decision','proposal','question']).optional(),scope:z.enum(['project','background']).optional()});
export const actionSchema = z.object({ task: z.string().min(1).max(300), owner: z.string().min(1).max(100).nullable(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), evidence: evidenceSchema, category:z.enum(['action','question']).optional() });
export const riskSchema = z.object({ type: z.enum(['delivery', 'financial', 'security', 'compliance', 'operational', 'other']), level: z.enum(['low', 'medium', 'high', 'critical']), description: z.string().min(1).max(500), impact: z.string().min(1).max(500), evidence: z.array(evidenceSchema).min(1).max(5) });
export const meetingAnalysisSchema = z.object({
  topic: factSchema.nullable(), meetingDate: factSchema.nullable(), location: factSchema.nullable(),
  participants: z.array(factSchema).max(40), topics: z.array(discussionSchema).max(40), decisions: z.array(discussionSchema).max(40),
  risks: z.array(riskSchema).max(20), actions: z.array(actionSchema).max(40),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export type MeetingAnalysis = z.infer<typeof meetingAnalysisSchema>;
export type MeetingAction = z.infer<typeof actionSchema>;
export const todoPatchSchema = z.object({ version: z.number().int().positive(), owner: z.string().trim().min(1).max(100).nullable(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), status: z.enum(['open', 'in_progress', 'done']) });
export const draftPatchSchema = z.object({ version: z.number().int().positive(), recipients: z.array(z.email()).max(10), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20000) });
export const meetingDetailSchema = z.object({
  meeting: z.object({ id: z.uuid(), filename: z.string(), status: z.enum(['uploaded', 'processing', 'ready', 'failed']), lineCount: z.number(), requestedVersion: z.number(), currentAnalysisId: z.string().nullable(), errorCode: z.string().nullable(), errorMessage: z.string().nullable() }),
  analysis: z.object({ id: z.uuid(), version: z.number(), result: meetingAnalysisSchema, model: z.string() }).nullable(),
  versions: z.array(z.object({ id: z.uuid(), version: z.number() })),
  risks: z.array(z.object({ id: z.uuid(), type: z.string(), level: z.string(), description: z.string(), impact: z.string(), evidence: z.array(evidenceSchema) })),
  todos: z.array(z.object({ id: z.uuid(), analysisId: z.uuid(), task: z.string(), owner: z.string().nullable(), dueDate: z.string().nullable(), status: z.enum(['open', 'in_progress', 'done']), version: z.number(), origin: z.enum(['meeting_action', 'risk_followup','meeting_question']), evidence: evidenceSchema,ignored:z.boolean().default(false) })),
  draft: z.object({ id: z.uuid(), analysisId: z.uuid(), version: z.number(), recipients: z.array(z.string()), subject: z.string(), body: z.string(), state: z.enum(['draft', 'confirmed']), deliveryState: z.enum(['not_sent','queued','processing','accepted','delivered','failed','unknown']), stale: z.boolean() }).nullable(),
});
export type MeetingDetail = z.infer<typeof meetingDetailSchema>;
