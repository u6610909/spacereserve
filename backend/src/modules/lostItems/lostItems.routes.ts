import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth';

import { list } from './lostItems.controller';

export const lostItemsRoutes = Router();

lostItemsRoutes.get('/', requireAuth, list);
