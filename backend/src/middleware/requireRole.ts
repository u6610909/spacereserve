import type { RequestHandler } from 'express';

import { ForbiddenError, UnauthorizedError } from '../lib/errors';

import type { Role } from '@prisma/client';

/** Must run after `requireAuth`. Ownership checks (organizer/attendee) live in services. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError(`Requires role: ${roles.join(' or ')}`));
      return;
    }
    next();
  };
}
