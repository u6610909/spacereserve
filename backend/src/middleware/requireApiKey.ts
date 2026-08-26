import type { RequestHandler } from 'express';

import { hashApiKey } from '../lib/apiKey';
import { UnauthorizedError } from '../lib/errors';
import { getPrisma } from '../lib/prisma';

/** Peer-facing auth (MASTER_PROMPT §7) — `x-api-key`, not JWT. Never stores or logs the raw key. */
export const requireApiKey: RequestHandler = async (req, _res, next) => {
  try {
    const rawKey = req.header('x-api-key');
    if (!rawKey) {
      next(new UnauthorizedError('Missing x-api-key header'));
      return;
    }

    const keyHash = hashApiKey(rawKey);
    const apiKey = await getPrisma().apiKey.findUnique({ where: { keyHash } });
    if (!apiKey) {
      next(new UnauthorizedError('Invalid API key'));
      return;
    }

    req.apiKey = { id: apiKey.id, name: apiKey.name };
    // Best-effort — a failed timestamp update must never block the request.
    getPrisma()
      .apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    next();
  } catch (err) {
    next(err);
  }
};
