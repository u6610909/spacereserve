import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Parses and replaces `req.body/query/params` with the validated (and
 * type-coerced) result. Zod errors are caught by `errorHandler`'s `ZodError`
 * branch — no try/catch needed here.
 */
export function validate({ body, query, params }: Schemas): RequestHandler {
  return (req, _res, next) => {
    if (body) req.body = body.parse(req.body);
    if (query) req.query = query.parse(req.query);
    if (params) req.params = params.parse(req.params);
    next();
  };
}
