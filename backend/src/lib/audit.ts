import { getPrisma } from './prisma';

import type { Prisma } from '@prisma/client';

interface AuditEntry {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

/** Every STAFF/ADMIN mutation writes one of these (business rule: staff/admin actions are audited). */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await getPrisma().auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      metadata: entry.metadata,
    },
  });
}
