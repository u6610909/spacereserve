import { Outlet } from 'react-router-dom';

import { NavBar } from './NavBar';

export function AppShell() {
  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-400">
          <span>SpaceReserve · Assumption University</span>
          <span>Campus room booking</span>
        </div>
      </footer>
    </div>
  );
}
