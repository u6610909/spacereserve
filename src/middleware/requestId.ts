import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

/**
 * Attaches a request id, honouring an upstream `x-request-id` from Nginx when
 * present so logs correlate across the proxy.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader('x-request-id', id);
  next();
};
