// Almacenamiento de tokens JWT y datos de usuario (paridad con el SPA vanilla).

export interface AuthUser {
  id: number;
  username: string;
  role: 'ADMIN' | 'EMPLEADO';
  full_name: string;
}

const ACCESS_KEY = 'fe.access';
const REFRESH_KEY = 'fe.refresh';
const USER_KEY = 'fe.user';

export const tokens = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  setAccess: (t: string) => localStorage.setItem(ACCESS_KEY, t),
  set(access: string, refresh: string, user: AuthUser) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },
  user(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  },
};

/** Decodifica el payload de un JWT (sin verificar firma). */
export function decodeJwt(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** true si el access token existe y no ha expirado. */
export function hasValidSession(): boolean {
  const t = tokens.access();
  if (!t) return false;
  const payload = decodeJwt(t);
  if (!payload?.exp) return false;
  return payload.exp * 1000 > Date.now();
}

// La capa de API avisa aquí cuando el refresh falla, para forzar logout.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  unauthorizedHandler = fn;
}
export function notifyUnauthorized() {
  unauthorizedHandler?.();
}
