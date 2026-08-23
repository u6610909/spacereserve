import { Role } from '@prisma/client';
import { z } from 'zod';

export const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  mode: z.enum(['json']).optional(),
});

export type CallbackQuery = z.infer<typeof callbackQuerySchema>;

/** Dev-only — hard-disabled in production regardless of this schema. */
export const devLoginBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).default('Dev User'),
  role: z.nativeEnum(Role).default(Role.STUDENT),
});

export type DevLoginBody = z.infer<typeof devLoginBodySchema>;
