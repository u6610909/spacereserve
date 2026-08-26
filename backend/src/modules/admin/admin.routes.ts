import { Role } from '@prisma/client';
import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';

import { auditLogs, utilization } from './admin.controller';
import { auditLogQuerySchema } from './admin.schema';

export const adminRoutes = Router();

const adminOnly = requireRole(Role.ADMIN);

adminRoutes.get('/audit-logs', requireAuth, adminOnly, validate({ query: auditLogQuerySchema }), auditLogs);
adminRoutes.get('/stats/utilization', requireAuth, adminOnly, utilization);
