import { NavLink } from 'react-router-dom';

import { logout } from '../../api/auth';
import { useAuth, useRefreshAuth } from '../../auth/AuthContext';
import { Logo } from '../ui/Logo';

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export function NavBar() {
  const { user } = useAuth();
  const refreshAuth = useRefreshAuth();
  if (!user) return null;

  async function handleLogout() {
    await logout();
    await refreshAuth();
  }

  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <NavLink to="/rooms" className="flex items-center gap-2 text-brand-700">
            <Logo className="h-6 w-6" />
            <span className="text-base font-semibold tracking-tight">SpaceReserve</span>
          </NavLink>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/rooms" className={linkClasses}>
              Rooms
            </NavLink>
            <NavLink to="/reservations" className={linkClasses}>
              My reservations
            </NavLink>
            {(user.role === 'STAFF' || user.role === 'ADMIN') && (
              <NavLink to="/manage/rooms" className={linkClasses}>
                Manage rooms
              </NavLink>
            )}
            {user.role === 'ADMIN' && (
              <NavLink to="/admin" className={linkClasses}>
                Admin
              </NavLink>
            )}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-2 text-right sm:flex">
            <div className="leading-tight">
              <div className="max-w-[12rem] truncate text-sm font-medium text-slate-800">{user.name}</div>
              <div className="text-xs capitalize text-slate-500">{user.role.toLowerCase()}</div>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {initials}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-md px-2.5 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
