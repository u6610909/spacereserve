import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';

import { callback, devLoginController, login, me, refresh } from './auth.controller';
import { callbackQuerySchema, devLoginBodySchema } from './auth.schema';

export const authRoutes = Router();

authRoutes.get('/login', login);
authRoutes.get('/callback', validate({ query: callbackQuerySchema }), callback);
authRoutes.get('/me', requireAuth, me);
authRoutes.post('/refresh', requireAuth, refresh);
// Hard-disabled in production inside the controller itself — never routed
// away entirely so the 404 it returns there is indistinguishable from any
// other unknown route.
authRoutes.post('/dev-login', validate({ body: devLoginBodySchema }), devLoginController);
