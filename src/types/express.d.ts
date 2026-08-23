import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` after verifying the JWT. */
      user?: {
        id: string;
        email: string;
        role: Role;
      };
    }
  }
}

export {};
