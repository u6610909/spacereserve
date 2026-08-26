import { NavLink } from 'react-router-dom';

import { logout } from '../../api/auth';
import { useAuth, useRefreshAuth } from '../../auth/AuthContext';

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
  }`;

export function NavBar() {
  const { user } = useAuth();
  const refreshAuth = useRefreshAuth();
  if (!user) return null;

  async function handleLogout() {
    await logout();
    await refreshAuth();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="text-base font-semibold text-brand-700">SpaceReserve</span>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/rooms" className={linkClasses}>
              Rooms
            </NavLink>
            <NavLink to="/reservations" className={linkClasses}>
              My Reservations
            </NavLink>
            {(user.role === 'STAFF' || user.role === 'ADMIN') && (
              <NavLink to="/manage/rooms" className={linkClasses}>
                Manage Rooms
              </NavLink>
            )}
            {user.role === 'ADMIN' && (
              <NavLink to="/admin" className={linkClasses}>
                Admin
              </NavLink>
            )}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-slate-500">
          <span className="max-w-[10rem] truncate">{user.name}</span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {user.role}
          </span>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
