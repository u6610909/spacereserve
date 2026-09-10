import { getPrisma } from '../../lib/prisma';

import type { SearchUsersQuery } from './users.schema';

export interface UserLookupResult {
  id: string;
  name: string;
  email: string;
}

/**
 * `email` is `@unique` on User, so this returns at most one row — still
 * `findMany` (not `findUnique` + 404) so an unmatched email is just an empty
 * array, not an error state, which is friendlier for a "still typing" UI.
 * Never returns `role`/`adObjectId` — this isn't a user-directory endpoint.
 */
export async function searchUsers(query: SearchUsersQuery): Promise<UserLookupResult[]> {
  return getPrisma().user.findMany({
    where: { email: query.email },
    select: { id: true, name: true, email: true },
  });
}
