import type { RequestHandler } from 'express';

import { naturalSearch } from './search.service';
import type { NaturalSearchBody } from './search.schema';

export const natural: RequestHandler = async (req, res, next) => {
  try {
    const { query } = req.body as NaturalSearchBody;
    const result = await naturalSearch(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
