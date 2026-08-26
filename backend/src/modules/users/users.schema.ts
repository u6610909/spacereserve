import { z } from 'zod';

/**
 * Exact-match lookup only — this exists to resolve "invite this person by
 * email" into a user id for the reservation-attendee flow, not to be a
 * general user directory/search endpoint.
 */
export const searchUsersQuerySchema = z.object({
  email: z.string().email(),
});

export type SearchUsersQuery = z.infer<typeof searchUsersQuerySchema>;
