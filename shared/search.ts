import { z } from 'zod';
export const searchModeSchema = z.enum(['auto', 'required', 'off']);
export type SearchMode = z.infer<typeof searchModeSchema>;
export const webSourceSchema = z.object({
  id: z.string(), title: z.string(), url: z.url().refine(v => /^https?:\/\//.test(v)),
  summary: z.string(), queriedAt: z.iso.datetime(), publishedAt: z.string().nullable(), quote: z.string(),
});
export type WebSource = z.infer<typeof webSourceSchema>;
