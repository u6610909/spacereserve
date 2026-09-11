import { Role } from '@prisma/client';
import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';

import { availability, create, getById, list, remove, removeImage, schedule, setImage, setStatus, update } from './rooms.controller';
import {
  createRoomSchema,
  listRoomsQuerySchema,
  roomDateQuerySchema,
  roomIdParamSchema,
  roomStatusSchema,
  updateRoomSchema,
} from './rooms.schema';
import { uploadRoomImage } from './rooms.upload';

export const roomsRoutes = Router();

const staffOrAdmin = requireRole(Role.STAFF, Role.ADMIN);

roomsRoutes.get('/', requireAuth, validate({ query: listRoomsQuerySchema }), list);

// Registered before '/:id' — otherwise Express would match "availability"
// as a room id.
roomsRoutes.get('/availability', requireAuth, validate({ query: roomDateQuerySchema }), availability);

roomsRoutes.get('/:id', requireAuth, validate({ params: roomIdParamSchema }), getById);
roomsRoutes.get(
  '/:id/schedule',
  requireAuth,
  validate({ params: roomIdParamSchema, query: roomDateQuerySchema }),
  schedule,
);
roomsRoutes.post('/', requireAuth, staffOrAdmin, validate({ body: createRoomSchema }), create);
roomsRoutes.patch(
  '/:id',
  requireAuth,
  staffOrAdmin,
  validate({ params: roomIdParamSchema, body: updateRoomSchema }),
  update,
);
roomsRoutes.patch(
  '/:id/status',
  requireAuth,
  staffOrAdmin,
  validate({ params: roomIdParamSchema, body: roomStatusSchema }),
  setStatus,
);
roomsRoutes.delete('/:id', requireAuth, staffOrAdmin, validate({ params: roomIdParamSchema }), remove);

roomsRoutes.post(
  '/:id/image',
  requireAuth,
  staffOrAdmin,
  validate({ params: roomIdParamSchema }),
  uploadRoomImage,
  setImage,
);
roomsRoutes.delete(
  '/:id/image',
  requireAuth,
  staffOrAdmin,
  validate({ params: roomIdParamSchema }),
  removeImage,
);
