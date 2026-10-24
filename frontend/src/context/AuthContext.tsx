import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiGet,
  apiPost,
  registerAuthHandlers,
  setCsrfToken,
} from '../lib/api';
import type { AuthMe, User } from '../types';

interface AuthState {
  user: User | null;
  permissions: unknown;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  clearSession: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setUser(null);
    setPermissions(null);
    setCsrfToken(null);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const me = await apiGet<AuthMe>('/auth/me');
      setUser(me.user);
      setPermissions(me.permissions);
      setError(null);
    } catch {
      clearSession();
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  const init = useCallback(async () => {
    try {
      const result = await apiGet<{ csrfToken: string }>('/auth/csrf');
      if (result?.csrfToken) {
        setCsrfToken(result.csrfToken);
      }
    } catch {
      // Boot continues even if csrf fetch fails; requests will still include cookies.
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    registerAuthHandlers({
      onUnauthenticated: () => clearSession(),
      onForbidden: () => {
        // Handled by UI toasts/banners where appropriate.
      },
      onRateLimited: () => {
        // Handled by UI where appropriate.
      },
    });
    void init();
  }, [clearSession, init]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const csrf = await apiGet<{ csrfToken: string }>('/auth/csrf');
      if (csrf?.csrfToken) {
        setCsrfToken(csrf.csrfToken);
      }
      const me = await apiPost<AuthMe>('/auth/login', { email, password });
      setUser(me.user);
      setPermissions(me.permissions);
    } catch (err) {
      clearSession();
      throw err;
    }
  }, [clearSession]);

  const logout = useCallback(async () => {
    try {
      await apiPost<void>('/auth/logout');
    } catch {
      // Clear session regardless of network failures.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value: AuthState = {
    user,
    permissions,
    loading,
    error,
    login,
    logout,
    refresh,
    clearSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
