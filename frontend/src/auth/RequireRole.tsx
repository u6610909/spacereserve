import { Navigate, Outlet } from 'react-router-dom';

import type { Role } from '../api/types';
import { useAuth } from './AuthContext';

/**
 * UX-only — hides pages a role can't use so nobody navigates into a broken
 * screen. The backend's requireRole middleware is the actual enforcement
 * boundary; this never substitutes for it.
 */
export function RequireRole({ allowed }: { allowed: Role[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!allowed.includes(user.role)) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
