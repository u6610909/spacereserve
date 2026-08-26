import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';

import { search } from './users.controller';
import { searchUsersQuerySchema } from './users.schema';

export const usersRoutes = Router();

usersRoutes.get('/', requireAuth, validate({ query: searchUsersQuerySchema }), search);
