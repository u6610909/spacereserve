import { Router } from 'express';

import { healthController } from './health.controller';

export const healthRoutes = Router();

// Public — no auth. Used by the Docker healthcheck and the demo curl.
healthRoutes.get('/health', healthController);
