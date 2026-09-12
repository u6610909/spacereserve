import type { RequestHandler } from 'express';

import { listAllLostItems } from './lostItems.service';

export const list: RequestHandler = async (_req, res, next) => {
  try {
    const items = await listAllLostItems();
    res.status(200).json({ items });
  } catch (err) {
    next(err);
  }
};
