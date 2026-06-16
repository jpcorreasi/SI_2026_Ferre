import { tokens, notifyUnauthorized } from './auth';

const BASE = '/api';

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(extractMessage(data) ?? `Error ${status}`);
    this.status = status;
    this.data = data;
  }
}

/** Extrae un mensaje legible de un cuerpo de error DRF/Nest. */
export function extractMessage(data: any): string | null {
  if (data == null) return null;
  if (typeof data === 'string') return data;
  if (data.detail) return data.detail;
  if (data.message) {
    return Array.isArray(data.message) ? data.message.join(', ') : data.message;
  }
  // Errores de validación por campo: {campo: ["msg"]}
  const first = Object.values(data)[0];
  if (Array.isArray(first)) return String(first[0]);
  if (typeof first === 'string') return first;
  return null;
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = tokens.refresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${BASE}/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.access) {
      tokens.setAccess(data.access);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

/**
 * Cliente HTTP con Authorization Bearer y refresco automático en 401.
 * `path` es relativo a /api (ej. '/products/').
 */
export async function apiRequest<T = any>(
  path: string,
  { method = 'GET', body }: RequestOptions = {},
): Promise<T> {
  const doFetch = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const access = tokens.access();
    if (access) headers.Authorization = `Bearer ${access}`;
    return fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      tokens.clear();
      notifyUnauthorized();
      throw new ApiError(401, { detail: 'Sesión expirada.' });
    }
  }

  if (res.status === 204) return null as T;

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T = any>(path: string) => apiRequest<T>(path),
  post: <T = any>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'POST', body }),
  put: <T = any>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T = any>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'PATCH', body }),
  del: <T = any>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
