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
      /** Set by `requireApiKey` after matching the `x-api-key` header's hash. */
      apiKey?: {
        id: string;
        name: string;
      };
    }
  }
}

export {};
