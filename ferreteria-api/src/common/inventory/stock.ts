import { Prisma } from '@prisma/client';

/**
 * SELECT ... FOR UPDATE sobre productos — equivalente a
 * Product.objects.select_for_update(). Debe usarse dentro de un
 * prisma.$transaction(async tx => ...).
 */
export async function lockProductsForUpdate(
  tx: Prisma.TransactionClient,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM products_product WHERE id IN (${Prisma.join(
      ids,
    )}) FOR UPDATE`,
  );
}

/** Suma cantidades por producto (un producto puede aparecer en varias lineas). */
export function sumByProduct(
  items: { product: number; quantity: number }[],
): Map<number, number> {
  const m = new Map<number, number>();
  for (const it of items) {
    m.set(it.product, (m.get(it.product) ?? 0) + it.quantity);
  }
  return m;
}
