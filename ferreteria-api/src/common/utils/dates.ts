/**
 * Utilidades de fecha sensibles a zona horaria. Colombia (America/Bogota) es
 * UTC-05:00 fijo (sin horario de verano), lo que simplifica los limites de dia.
 */
const BOGOTA_OFFSET = '-05:00';

/**
 * Fecha local de Bogota como Date a medianoche UTC del dia local — equivalente
 * a `timezone.localdate()` de Django. Se guarda en columnas @db.Date.
 */
export function bogotaToday(): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Convierte 'YYYY-MM-DD' al inicio de ese dia en Bogota (instante UTC). */
export function bogotaDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000${BOGOTA_OFFSET}`);
}

/** Convierte 'YYYY-MM-DD' al final de ese dia en Bogota (instante UTC). */
export function bogotaDayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999${BOGOTA_OFFSET}`);
}

/** Date 'YYYY-MM-DD' a Date UTC-midnight, para columnas @db.Date. */
export function parseDateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * Fecha compacta 'YYYYMMDD' en UTC — paridad con
 * timezone.now().strftime('%Y%m%d') de Django (now() es UTC aware).
 * Se usa para el prefijo de numeracion FV-/NC-.
 */
export function utcDateCompact(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/** Fecha local UTC de hoy a medianoche (timezone.now().date() de Django). */
export function utcToday(): Date {
  return new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
}

/** Fecha local de Bogota como 'YYYY-MM-DD' (date.today() con TZ Bogota). */
export function bogotaTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** 'HH:MM[:SS]' -> Date (1970-01-01 UTC) para columnas @db.Time. */
export function parseTime(value: string): Date {
  const t = value.length === 5 ? `${value}:00` : value;
  return new Date(`1970-01-01T${t}.000Z`);
}

/** Date (@db.Time) -> 'HH:MM:SS' como DRF TimeField. */
export function formatTime(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(11, 19) : null;
}
