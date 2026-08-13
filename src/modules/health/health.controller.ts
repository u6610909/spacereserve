import type { RequestHandler } from 'express';

import { getHealth } from './health.service';

export const healthController: RequestHandler = async (_req, res, next) => {
  try {
    const report = await getHealth();
    res.status(report.status === 'ok' ? 200 : 503).json(report);
  } catch (err) {
    next(err);
  }
};
