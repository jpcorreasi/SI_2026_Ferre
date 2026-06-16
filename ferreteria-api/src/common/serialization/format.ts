import { Prisma } from '@prisma/client';

type Decimalish = Prisma.Decimal | number | string | null | undefined;

/**
 * Formatea dinero como DRF DecimalField: string con 2 decimales (o null).
 * "45000.00", no 45000. Mantiene el contrato que consume el SPA.
 */
export function money(value: Decimalish): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Prisma.Decimal) {
    return value.toFixed(2);
  }
  return new Prisma.Decimal(value).toFixed(2);
}

/** DateTime -> ISO 8601 (o null). DRF-compatible para el frontend. */
export function dt(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** DateField -> 'YYYY-MM-DD' (o null), como DRF DateField. */
export function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
