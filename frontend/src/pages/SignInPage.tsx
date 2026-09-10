import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { devLogin, microsoftLoginUrl } from '../api/auth';
import { useAuth, useRefreshAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Input, Select } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';
import type { Role } from '../api/types';

// The backend already 404s /auth/dev-login in production — this flag just
// keeps the form itself from showing a dead UI there.
const ALLOW_DEV_LOGIN = import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEV_LOGIN === 'true';

const QUICK_LOGINS: { role: Role; label: string; email: string }[] = [
  { role: 'STUDENT', label: 'Student', email: 'student@demo.dev' },
  { role: 'STAFF', label: 'Staff', email: 'staff@demo.dev' },
  { role: 'ADMIN', label: 'Admin', email: 'admin@demo.dev' },
];

const HIGHLIGHTS = [
  'Search 30+ rooms across seven campus buildings',
  'Book in seconds and invite classmates',
  'Practice rooms, labs, lecture theatres, and the recital hall',
];

export function SignInPage() {
  const { user, isLoading } = useAuth();
  const refreshAuth = useRefreshAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('STUDENT');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState<Role | 'form' | null>(null);

  if (!isLoading && user) return <Navigate to="/rooms" replace />;

  async function signIn(loginEmail: string, loginName: string, loginRole: Role, key: Role | 'form') {
    setError(null);
    setSubmitting(key);
    try {
      await devLogin(loginEmail, loginName, loginRole);
      await refreshAuth();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden flex-col justify-between bg-brand-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="text-lg font-semibold tracking-tight">SpaceReserve</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Campus rooms, booked without the paperwork.</h1>
          <ul className="mt-8 flex flex-col gap-3 text-sm text-brand-100">
            {HIGHLIGHTS.map((h) => (
              <li key={h} className="flex items-start gap-2.5">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="mt-0.5 h-4 w-4 shrink-0"
                >
                  <path d="M4 12.5l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {h}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-brand-200">Assumption University · Facility Management</p>
      </div>

      {/* Sign-in */}
      <div className="flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 text-brand-700 lg:hidden">
            <Logo className="h-7 w-7" />
            <span className="text-lg font-semibold tracking-tight">SpaceReserve</span>
          </div>

          <h2 className="mt-8 text-xl font-semibold text-slate-900 lg:mt-0">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your Assumption University account.</p>

          <a href={microsoftLoginUrl()} className="mt-6 block">
            <Button type="button" className="w-full" variant="primary">
              <MicrosoftGlyph />
              Sign in with Microsoft
            </Button>
          </a>

          {ALLOW_DEV_LOGIN && (
            <>
              <div className="mt-6 flex items-center gap-3 text-xs text-slate-400">
                <div className="h-px flex-1 bg-slate-200" />
                dev / test sign-in
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <span className="text-xs font-medium text-slate-500">Quick login</span>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_LOGINS.map((q) => (
                    <Button
                      key={q.role}
                      type="button"
                      variant="secondary"
                      disabled={submitting !== null}
                      onClick={() => void signIn(q.email, `Demo ${q.label}`, q.role, q.role)}
                    >
                      {submitting === q.role ? '…' : q.label}
                    </Button>
                  ))}
                </div>
              </div>

              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                  Or sign in as a specific user
                </summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void signIn(email, name || 'Dev User', role, 'form');
                  }}
                  className="mt-3 flex flex-col gap-3"
                >
                  <Input
                    label="Email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.edu"
                  />
                  <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dev User" />
                  <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    <option value="STUDENT">Student</option>
                    <option value="STAFF">Staff</option>
                    <option value="ADMIN">Admin</option>
                  </Select>
                  <Button type="submit" variant="secondary" disabled={submitting !== null}>
                    {submitting === 'form' ? 'Signing in…' : 'Sign in (dev)'}
                  </Button>
                </form>
              </details>

              <div className="mt-4">
                <ErrorBanner error={error} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MicrosoftGlyph() {
  return (
    <svg viewBox="0 0 21 21" className="h-4 w-4" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
