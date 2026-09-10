import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { config } from '../config';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

/**
 * Terminal error middleware. Production responses never contain stack traces
 * or internal messages (MASTER_PROMPT §8 hardening).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = res.getHeader('x-request-id');

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: err.issues },
      requestId,
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ err, requestId }, 'application error');
    } else {
      logger.warn({ code: err.code, status: err.status, requestId }, err.message);
    }
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      requestId,
    });
    return;
  }

  logger.error({ err, requestId }, 'unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProduction ? 'Internal server error' : String((err as Error)?.message ?? err),
    },
    requestId,
  });
};
