import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { requireApiKey } from '../../middleware/requireApiKey';
import { validate } from '../../middleware/validate';

import { activeAt } from './external.controller';
import { activeAtQuerySchema } from './external.schema';

export const externalRoutes = Router();

const activeAtLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.apiKey?.id ?? req.ip ?? 'anonymous',
});

externalRoutes.get(
  '/bookings/active-at',
  requireApiKey,
  activeAtLimiter,
  validate({ query: activeAtQuerySchema }),
  activeAt,
);
