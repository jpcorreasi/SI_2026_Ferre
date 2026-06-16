import { Request } from 'express';

/**
 * Replica audit/mixins.py::_get_client_ip — primer salto de X-Forwarded-For,
 * con fallback a la IP de la conexion.
 */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = value.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return req.socket?.remoteAddress ?? req.ip ?? null;
}
