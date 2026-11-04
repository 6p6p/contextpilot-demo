import { z } from 'zod';
export const deliveryStatusSchema = z.enum(['queued', 'processing', 'accepted', 'delivered', 'failed', 'unknown']);
export const sendEmailSchema = z.object({ version: z.number().int().positive(), confirmSend: z.literal(true) }).strict();
export const deliverySchema = z.object({ id: z.uuid(), draftId: z.uuid(), version: z.number(), recipients: z.array(z.string()), sender: z.string(), subject: z.string(), body: z.string(), status: deliveryStatusSchema, providerMessageId: z.string().nullable(), providerEvent: z.string().nullable(), errorCode: z.string().nullable(), requestId: z.string(), providerRequestId: z.string().nullable(), createdAt: z.string(), attemptedAt: z.string().nullable(), acceptedAt: z.string().nullable(), checkedAt: z.string().nullable() });
export const emailHistorySchema = z.object({ deliveries: z.array(deliverySchema) });
export const emailConfigSchema = z.object({ enabled: z.boolean(), configured: z.boolean(), sender: z.string().nullable(), mode: z.enum(['test', 'verified']), allowedRecipients: z.array(z.string()) });
export type EmailDelivery = z.infer<typeof deliverySchema>;
export type EmailPayload = { sender: string; recipients: string[]; subject: string; body: string };
