import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';

import { verifyAccessToken } from '../lib/jwt';
import { UnauthorizedError } from '../lib/errors';

function extractToken(req: Parameters<RequestHandler>[0]): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  // Fallback: the httpOnly session cookie set by /auth/callback.
  return req.signedCookies?.session as string | undefined;
}

/** Verifies the JWT (header or session cookie) and attaches `req.user`. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) {
    next(new UnauthorizedError('Missing bearer token or session cookie'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
      return;
    }
    next(new UnauthorizedError('Invalid token'));
  }
};
