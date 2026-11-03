import { z } from 'zod';
import { evidenceSchema } from './meetings.js';
export const memoryKindSchema = z.enum(['person', 'time', 'place', 'topic', 'event', 'decision']);
export const extractedMemorySchema = z.object({ kind: memoryKindSchema, content: z.string().trim().min(1).max(300), evidence: evidenceSchema });
export type ExtractedMemory = z.infer<typeof extractedMemorySchema>;
export const memorySourceSchema = z.object({ sourceType: z.enum(['chat', 'meeting']), sourceId: z.uuid(), parentId: z.uuid(), observedAt: z.string(), evidence: evidenceSchema });
export const memoryCitationSchema = z.object({ id: z.uuid(), kind: memoryKindSchema, content: z.string(), sources: z.array(memorySourceSchema) });
export type MemoryCitation = z.infer<typeof memoryCitationSchema>;
export const memoryListSchema = z.object({ configured: z.boolean(), memories: z.array(memoryCitationSchema), jobs: z.array(z.object({ id: z.uuid(), sourceType: z.string(), sourceId: z.uuid(), status: z.string(), errorCode: z.string().nullable(), createdAt: z.string() })) });
