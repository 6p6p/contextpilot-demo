import { z } from 'zod';

export const createConversationSchema = z.object({ title: z.string().trim().min(1).max(100).default('新对话') });
export const sendMessageSchema = z.object({ clientRequestId: z.uuid(), content: z.string().trim().min(1).max(4000) });
export const conversationSchema = z.object({ id: z.uuid(), title: z.string(), createdAt: z.string(), updatedAt: z.string() });
export const messageSchema = z.object({
  id: z.uuid(), conversationId: z.uuid(), clientRequestId: z.uuid(), ordinal: z.number(),
  role: z.enum(['user', 'assistant']), content: z.string(), status: z.enum(['completed', 'processing', 'failed']),
  errorCode: z.string().nullable(), model: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
});
export const conversationsResponse = z.object({ conversations: z.array(conversationSchema) });
export const messagesResponse = z.object({ messages: z.array(messageSchema) });
export type Conversation = z.infer<typeof conversationSchema>;
export type ChatMessage = z.infer<typeof messageSchema>;
