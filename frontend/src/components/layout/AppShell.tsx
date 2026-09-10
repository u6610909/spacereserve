import { Outlet } from 'react-router-dom';

import { NavBar } from './NavBar';

export function AppShell() {
  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
