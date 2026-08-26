import { z } from 'zod';

export const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
