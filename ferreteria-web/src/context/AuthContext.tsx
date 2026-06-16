import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import {
  AuthUser,
  tokens,
  hasValidSession,
  setUnauthorizedHandler,
} from '../lib/auth';
import { api } from '../lib/api';
import { LoginResponse } from '../types/api';

interface AuthCtx {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    hasValidSession() ? tokens.user() : null,
  );

  const logout = useCallback(() => {
    // Cierra sesión en el backend (best-effort) y limpia el estado local.
    api.post('/token/logout/', { refresh: tokens.refresh() }).catch(() => {});
    tokens.clear();
    setUser(null);
  }, []);

  // La capa de API fuerza logout si el refresh falla.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post<LoginResponse>('/token/', { username, password });
    tokens.set(data.access, data.refresh, data.user);
    setUser(data.user);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'ADMIN',
      login,
      logout,
    }),
    [user, login, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
