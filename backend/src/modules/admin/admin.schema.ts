import { z } from 'zod';

export const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const issuePeerKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type IssuePeerKeyInput = z.infer<typeof issuePeerKeySchema>;

export const createPeerIntegrationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  baseUrl: z.string().trim().url(),
  apiKey: z.string().trim().min(1),
  notes: z.string().trim().max(2000).optional(),
});

export type CreatePeerIntegrationInput = z.infer<typeof createPeerIntegrationSchema>;

export const peerIntegrationIdParamSchema = z.object({ id: z.string().uuid() });
