import { get } from './client';

export interface UserLookupResult {
  id: string;
  name: string;
  email: string;
}

export function searchUserByEmail(email: string): Promise<{ users: UserLookupResult[] }> {
  return get(`/users?email=${encodeURIComponent(email)}`);
}
