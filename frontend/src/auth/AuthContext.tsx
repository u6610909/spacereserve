import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';

import { getMe } from '../api/auth';
import { ApiError } from '../api/client';
import type { User } from '../api/types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const { user } = await getMe();
        return user;
      } catch (err) {
        // Not signed in — expected, not a loading failure to surface.
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  return (
    <AuthContext.Provider value={{ user: data ?? null, isLoading, refetch }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Call after any login action so the whole app picks up the new session. */
export function useRefreshAuth() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['me'] });
}
