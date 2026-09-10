import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { logout } from '../../api/auth';
import { useAuth, useRefreshAuth } from '../../auth/AuthContext';
import { Logo } from '../ui/Logo';

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

function ProfileMenu({ name, role, onSignOut }: { name: string; role: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-2 pr-1 text-sm hover:bg-slate-100"
      >
        <span className="hidden max-w-[10rem] truncate font-medium text-slate-800 sm:block">{name}</span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          {initials}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <div className="truncate text-sm font-medium text-slate-800">{name}</div>
            <div className="text-xs capitalize text-slate-500">{role.toLowerCase()}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
              <path
                d="M15 12H3m0 0l4-4m-4 4l4 4M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function NavBar() {
  const { user } = useAuth();
  const refreshAuth = useRefreshAuth();
  if (!user) return null;

  async function handleLogout() {
    await logout();
    await refreshAuth();
  }

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
        <ProfileMenu name={user.name} role={user.role} onSignOut={() => void handleLogout()} />
      </div>
    </header>
  );
}
