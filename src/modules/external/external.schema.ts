import { z } from 'zod';

export const activeAtQuerySchema = z.object({
  room: z.string().min(1),
  at: z.coerce.date(),
});

export type ActiveAtQuery = z.infer<typeof activeAtQuerySchema>;
