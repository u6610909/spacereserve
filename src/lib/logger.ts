import pino from 'pino';

import { config } from '../config';

/**
 * Structured logger. Secrets must never reach the logs, so anything that could
 * carry one is redacted here rather than at each call site.
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: 'spacereserve', version: config.version },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
      'password',
      '*.password',
      'token',
      '*.token',
      'secret',
      '*.secret',
      'apiKey',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
  ...(config.isProduction ? {} : { transport: { target: 'pino/file', options: { destination: 1 } } }),
});

export type Logger = typeof logger;
