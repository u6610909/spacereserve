import type { RequestHandler } from 'express';

import { NotFoundError } from '../lib/errors';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No route for ${req.method} ${req.originalUrl}`));
};
