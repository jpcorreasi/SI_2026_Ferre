import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Compatibilidad con el hasher por defecto de Django: `pbkdf2_sha256`.
 * Formato almacenado:  pbkdf2_sha256$<iterations>$<salt>$<hash_base64>
 *
 * Permite verificar contraseñas de usuarios migrados desde Django sin
 * forzar reset, y generar hashes nuevos en el mismo formato (seed, alta de
 * empleados) para que Django y NestJS sean interoperables sobre la misma BD.
 */

const ALGORITHM = 'pbkdf2_sha256';
// Iteraciones por defecto: alineadas con Django 5/6. Si un hash migrado trae
// otro valor, se respeta al verificar (se lee del propio hash).
const DEFAULT_ITERATIONS = 870000;
const DKLEN = 32;
const SALT_BYTES = 12;

function derive(password: string, salt: string, iterations: number): string {
  return pbkdf2Sync(password, salt, iterations, DKLEN, 'sha256').toString(
    'base64',
  );
}

export function makePassword(
  password: string,
  iterations: number = DEFAULT_ITERATIONS,
): string {
  // salt alfanumerico estilo Django (sin '$' para no romper el split).
  const salt = randomBytes(SALT_BYTES).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const hash = derive(password, salt, iterations);
  return `${ALGORITHM}$${iterations}$${salt}$${hash}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  if (!encoded || !encoded.startsWith(`${ALGORITHM}$`)) {
    return false;
  }
  const parts = encoded.split('$');
  if (parts.length !== 4) {
    return false;
  }
  const [, iterationsRaw, salt, expectedHash] = parts;
  const iterations = parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }
  const actualHash = derive(password, salt, iterations);
  const a = Buffer.from(actualHash);
  const b = Buffer.from(expectedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Detecta si un hash migrado usa menos iteraciones que las actuales. */
export function needsRehash(
  encoded: string,
  iterations: number = DEFAULT_ITERATIONS,
): boolean {
  const parts = encoded.split('$');
  if (parts.length !== 4) {
    return true;
  }
  return parseInt(parts[1], 10) < iterations;
}
