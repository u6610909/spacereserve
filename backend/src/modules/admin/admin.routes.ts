import { Role } from '@prisma/client';
import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';

import {
  auditLogs,
  createPeerIntegration,
  deletePeerIntegration,
  deletePeerKey,
  issuePeerKey,
  listPeerIntegrations,
  overview,
  revealPeerIntegrationKey,
  searchReservations,
  utilization,
} from './admin.controller';
import {
  auditLogQuerySchema,
  createPeerIntegrationSchema,
  issuePeerKeySchema,
  peerIntegrationIdParamSchema,
  peerKeyIdParamSchema,
  reservationSearchQuerySchema,
} from './admin.schema';

export const adminRoutes = Router();

const adminOnly = requireRole(Role.ADMIN);

adminRoutes.get('/audit-logs', requireAuth, adminOnly, validate({ query: auditLogQuerySchema }), auditLogs);
adminRoutes.get('/stats/utilization', requireAuth, adminOnly, utilization);
adminRoutes.get('/stats/overview', requireAuth, adminOnly, overview);

// "Who booked with whom" search — room, organizer, attendees, headcount.
// Separate from /audit-logs, which only records STAFF/ADMIN actions.
adminRoutes.get(
  '/reservations',
  requireAuth,
  adminOnly,
  validate({ query: reservationSearchQuerySchema }),
  searchReservations,
);

// Issue a new x-api-key for any partner team calling *our* peer endpoint —
// not limited to FinderAI. See src/modules/external/ for what it unlocks.
adminRoutes.post('/peer-keys', requireAuth, adminOnly, validate({ body: issuePeerKeySchema }), issuePeerKey);
adminRoutes.delete(
  '/peer-keys/:id',
  requireAuth,
  adminOnly,
  validate({ params: peerKeyIdParamSchema }),
  deletePeerKey,
);

// Bookkeeping for peer APIs *we* consume — see admin.service.ts
// (listPeerIntegrations doc comment) for why this isn't a generic caller.
adminRoutes.get('/peer-integrations', requireAuth, adminOnly, listPeerIntegrations);
adminRoutes.post(
  '/peer-integrations',
  requireAuth,
  adminOnly,
  validate({ body: createPeerIntegrationSchema }),
  createPeerIntegration,
);
adminRoutes.get(
  '/peer-integrations/:id/reveal',
  requireAuth,
  adminOnly,
  validate({ params: peerIntegrationIdParamSchema }),
  revealPeerIntegrationKey,
);
adminRoutes.delete(
  '/peer-integrations/:id',
  requireAuth,
  adminOnly,
  validate({ params: peerIntegrationIdParamSchema }),
  deletePeerIntegration,
);
