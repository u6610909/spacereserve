import type { RequestHandler } from 'express';

import * as usersService from './users.service';
import type { SearchUsersQuery } from './users.schema';

export const search: RequestHandler = async (req, res, next) => {
  try {
    const users = await usersService.searchUsers(req.query as unknown as SearchUsersQuery);
    res.status(200).json({ users });
  } catch (err) {
    next(err);
  }
};
