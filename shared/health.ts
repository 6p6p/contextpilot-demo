import { z } from 'zod';

export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('contextpilot-api'),
  database: z.enum(['not_configured', 'not_checked']),
});
export type Health = z.infer<typeof healthSchema>;
