import { z } from 'zod';

export const citationSchema = z.object({
  sourceId: z.uuid(), documentId: z.uuid(), filename: z.string(), page: z.number().int().positive(), quote: z.string(),
});
export type Citation = z.infer<typeof citationSchema>;
export const documentSchema = z.object({
  id: z.uuid(), filename: z.string(), size: z.number(), status: z.enum(['uploaded', 'processing', 'ready', 'failed']),
  pageCount: z.number().nullable(), chunkCount: z.number(), errorCode: z.string().nullable(), errorMessage: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});
export const documentsResponse = z.object({ documents: z.array(documentSchema) });
export type KnowledgeDocument = z.infer<typeof documentSchema>;
