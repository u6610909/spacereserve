import { z } from 'zod';

export const naturalSearchBodySchema = z.object({
  query: z.string().min(1).max(500),
});

export type NaturalSearchBody = z.infer<typeof naturalSearchBodySchema>;
