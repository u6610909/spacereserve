import { get, post } from './client';
import type { Role, User } from './types';

export function getMe(): Promise<{ user: User }> {
  return get('/auth/me');
}

export function devLogin(email: string, name: string, role: Role): Promise<{ token: string; user: User }> {
  return post('/auth/dev-login', { email, name, role });
}

export function logout(): Promise<void> {
  return post('/auth/logout');
}

/** Full navigation, not fetch — this is a redirect flow through Microsoft. */
export function microsoftLoginUrl(): string {
  return '/spacereserve/api/v1/auth/login';
}
