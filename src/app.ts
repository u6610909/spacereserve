import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, Router } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { config, requireJwtSecret } from './config';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { requestId } from './middleware/requestId';
import { authRoutes } from './modules/auth/auth.routes';
import { healthRoutes } from './modules/health/health.routes';
import { roomsRoutes } from './modules/rooms/rooms.routes';

/**
 * Express assembly, exported separately from `index.ts` so supertest can drive
 * the app without opening a port.
 *
 * The `/spacereserve` prefix is kept inside Express (not stripped by Nginx) so
 * OIDC redirect URIs and generated links are correct behind the proxy.
 */
export function createApp(): Express {
  const app = express();

  // Behind Nginx: trust exactly one proxy hop so req.ip / rate limiting and
  // req.protocol reflect the real client, not 127.0.0.1.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => String(res.getHeader('x-request-id')),
      autoLogging: { ignore: (req) => req.url?.endsWith('/health') === true },
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false }));
  // Signed cookies carry the OIDC `state` + PKCE `code_verifier`, and the
  // callback session cookie (Settled design decisions in CLAUDE.md). Signed
  // with the same JWT secret — resolveSecrets() must run before createApp().
  app.use(cookieParser(requireJwtSecret()));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: (req) => req.path.endsWith('/health'),
    }),
  );

  const api = Router();
  api.use(healthRoutes);
  api.use('/auth', authRoutes);
  api.use('/rooms', roomsRoutes);
  app.use(config.basePath, api);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
