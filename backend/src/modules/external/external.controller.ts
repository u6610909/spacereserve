import type { RequestHandler } from 'express';

import { getActiveBookingAt } from './external.service';
import type { ActiveAtQuery } from './external.schema';

export const activeAt: RequestHandler = async (req, res, next) => {
  try {
    const { room, at } = req.query as unknown as ActiveAtQuery;
    const result = await getActiveBookingAt(room, at);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
