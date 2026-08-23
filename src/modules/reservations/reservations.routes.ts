import { Role } from '@prisma/client';
import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';

import { addAttendee, cancel, checkIn, create, getById, listMine, override, removeAttendee } from './reservations.controller';
import {
  addAttendeeSchema,
  attendeeParamSchema,
  createReservationSchema,
  reservationIdParamSchema,
} from './reservations.schema';

export const reservationsRoutes = Router();

reservationsRoutes.post('/', requireAuth, validate({ body: createReservationSchema }), create);
reservationsRoutes.get('/mine', requireAuth, listMine);
reservationsRoutes.get('/:id', requireAuth, validate({ params: reservationIdParamSchema }), getById);
reservationsRoutes.delete('/:id', requireAuth, validate({ params: reservationIdParamSchema }), cancel);
reservationsRoutes.post(
  '/:id/override',
  requireAuth,
  requireRole(Role.STAFF, Role.ADMIN),
  validate({ params: reservationIdParamSchema }),
  override,
);
reservationsRoutes.post(
  '/:id/check-in',
  requireAuth,
  validate({ params: reservationIdParamSchema }),
  checkIn,
);
reservationsRoutes.post(
  '/:id/attendees',
  requireAuth,
  validate({ params: reservationIdParamSchema, body: addAttendeeSchema }),
  addAttendee,
);
reservationsRoutes.delete(
  '/:id/attendees/:userId',
  requireAuth,
  validate({ params: attendeeParamSchema }),
  removeAttendee,
);
