import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';

import { natural } from './search.controller';
import { naturalSearchBodySchema } from './search.schema';

export const searchRoutes = Router();

const naturalSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
});

searchRoutes.post('/natural', requireAuth, naturalSearchLimiter, validate({ body: naturalSearchBodySchema }), natural);
