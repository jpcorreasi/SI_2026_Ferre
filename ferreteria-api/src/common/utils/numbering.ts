import { Prisma } from '@prisma/client';

/**
 * Genera el siguiente numero de secuencia diaria con formato
 * `<prefix>-NNNN` (ej. FV-20260615-0007), de forma atomica.
 *
 * Usa pg_advisory_xact_lock(prefix) para serializar la numeracion por dia/tipo
 * dentro de la transaccion — equivalente (y mas robusto ante secuencia vacia)
 * al select_for_update() del save() de Django.
 *
 * `table` y `column` son literales controlados por el codigo (no input de
 * usuario); el LIKE va parametrizado.
 */
export async function nextDailyNumber(
  tx: Prisma.TransactionClient,
  table: string,
  column: string,
  prefix: string,
): Promise<string> {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${prefix}), 0)`,
  );
  const rows = (await tx.$queryRawUnsafe(
    `SELECT "${column}" AS n FROM "${table}" WHERE "${column}" LIKE $1 ORDER BY "${column}" DESC LIMIT 1`,
    `${prefix}-%`,
  )) as { n: string }[];

  let seq = 1;
  if (rows.length > 0) {
    seq = parseInt(rows[0].n.split('-').pop()!, 10) + 1;
  }
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}
