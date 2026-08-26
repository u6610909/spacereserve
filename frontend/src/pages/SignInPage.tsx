import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { devLogin, microsoftLoginUrl } from '../api/auth';
import { useAuth, useRefreshAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Input, Select } from '../components/ui/Input';
import type { Role } from '../api/types';

// The backend already 404s /auth/dev-login in production — this flag just
// keeps the form itself from showing a dead UI there.
const ALLOW_DEV_LOGIN = import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEV_LOGIN === 'true';

export function SignInPage() {
  const { user, isLoading } = useAuth();
  const refreshAuth = useRefreshAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('STUDENT');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && user) return <Navigate to="/rooms" replace />;

  async function handleDevLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await devLogin(email, name || 'Dev User', role);
      await refreshAuth();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-brand-700">SpaceReserve</h1>
        <p className="mt-1 text-sm text-slate-500">Campus room booking</p>
      </div>

      <a href={microsoftLoginUrl()}>
        <Button type="button" className="w-full" variant="primary">
          Sign in with Microsoft
        </Button>
      </a>

      {ALLOW_DEV_LOGIN && (
        <>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            dev/test sign-in
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={(e) => void handleDevLogin(e)} className="flex flex-col gap-3">
            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.edu"
            />
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dev User"
            />
            <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="STUDENT">Student</option>
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </Select>
            <ErrorBanner error={error} />
            <Button type="submit" variant="secondary" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in (dev)'}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
