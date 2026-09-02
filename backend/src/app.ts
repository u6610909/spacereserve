import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, Router } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { config, requireJwtSecret } from './config';
import { logger } from './lib/logger';
import { UPLOADS_ROOT } from './lib/roomImages';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { requestId } from './middleware/requestId';
import { adminRoutes } from './modules/admin/admin.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { externalRoutes } from './modules/external/external.routes';
import { healthRoutes } from './modules/health/health.routes';
import { reservationsRoutes } from './modules/reservations/reservations.routes';
import { roomsRoutes } from './modules/rooms/rooms.routes';
import { searchRoutes } from './modules/search/search.routes';
import { usersRoutes } from './modules/users/users.routes';

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
      // Also skips /spacereserve/uploads (room photos): a plain express.static
      // read, not a business-logic endpoint, and one room grid page already
      // requests a dozen-plus thumbnails — sharing the API budget with those
      // meant a few page loads could 429 real API calls. Caught this by
      // actually loading the browse page after seeding real photos, not just
      // by testing the upload endpoint in isolation.
      skip: (req) => req.path.endsWith('/health') || req.path.startsWith('/spacereserve/uploads/'),
    }),
  );

  // Room photos — a real directory on disk (volume-mounted in prod so they
  // survive a redeploy), not the API-versioned prefix; see lib/roomImages.ts.
  app.use('/spacereserve/uploads', express.static(UPLOADS_ROOT));

  const api = Router();
  api.use(healthRoutes);
  api.use('/auth', authRoutes);
  api.use('/rooms', roomsRoutes);
  api.use('/users', usersRoutes);
  api.use('/reservations', reservationsRoutes);
  api.use('/search', searchRoutes);
  api.use('/external', externalRoutes);
  api.use('/admin', adminRoutes);
  app.use(config.basePath, api);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
