import jwt from 'jsonwebtoken';

import { requireJwtSecret } from '../config';

import type { Role } from '@prisma/client';

const ISSUER = 'spacereserve';
const EXPIRES_IN = '1h';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: Role;
}

export interface AccessTokenPayload extends AccessTokenClaims {
  iat: number;
  exp: number;
  iss: string;
}

/** HS256, 1h, claims `sub,email,role,iat,exp,iss` (MASTER_PROMPT §8). */
export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, requireJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: EXPIRES_IN,
    issuer: ISSUER,
  });
}

/** Throws `jwt.JsonWebTokenError` / `jwt.TokenExpiredError` on failure. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, requireJwtSecret(), {
    algorithms: ['HS256'],
    issuer: ISSUER,
  }) as AccessTokenPayload;
}
