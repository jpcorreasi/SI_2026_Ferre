/**
 * Chequeos de integridad de datos — paridad con
 * accounts/management/commands/run_validation_checks.py
 * Uso:  npm run validate
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type Result = [name: string, passed: boolean, detail: string];

async function checkLowStock(): Promise<Result> {
  const name = 'Low-stock products detected';
  const products = await prisma.product.findMany({ orderBy: { code: 'asc' } });
  if (products.length === 0) return [name, true, 'No products in DB'];
  const low = products.filter((p) => p.stock <= p.minStock);
  if (low.length === 0)
    return [name, true, `All ${products.length} product(s) are above min_stock`];
  const items = low.map((p) => `${p.code} "${p.name}" (stock=${p.stock}, min=${p.minStock})`).join(', ');
  return [name, true, `${low.length} product(s) below min_stock: ${items}`];
}

async function checkPasswords(): Promise<Result> {
  const name = 'Passwords stored as hashes (not plain)';
  const users = await prisma.user.findMany({ select: { username: true, password: true } });
  if (users.length === 0) return [name, true, 'No users in DB'];
  const plain = users
    .filter((u) => u.password && !u.password.startsWith('!') && !u.password.includes('$'))
    .map((u) => u.username);
  if (plain.length > 0)
    return [name, false, `Plain-text passwords detected for: ${JSON.stringify(plain)}`];
  return [name, true, `All ${users.length} user(s) have hashed passwords (contain '$')`];
}

async function checkAuditSession(): Promise<Result> {
  const name = 'AuditSession table is queryable';
  const count = await prisma.auditSession.count();
  return [name, true, `Table queryable — ${count} session record(s) found`];
}

async function checkSaleTotals(): Promise<Result> {
  const name = 'Sale totals match SaleItems sum';
  const sales = await prisma.sale.findMany({ include: { items: true } });
  if (sales.length === 0) return [name, true, 'No sales in DB'];
  const mismatches: string[] = [];
  for (const sale of sales) {
    const itemSum = sale.items.reduce(
      (acc, it) => acc.add(it.subtotal),
      new Prisma.Decimal(0),
    );
    if (sale.total.sub(itemSum).abs().gt(new Prisma.Decimal('0.01')))
      mismatches.push(`Sale #${sale.id}: stored_total=${sale.total}, items_sum=${itemSum}`);
  }
  if (mismatches.length > 0) return [name, false, 'Mismatches — ' + mismatches.join(' | ')];
  return [name, true, `All ${sales.length} sale(s): total == SUM(subtotal)`];
}

async function checkDuplicateNit(): Promise<Result> {
  const name = 'Duplicate NIT raises unique error';
  const existing = await prisma.supplier.findFirst();
  if (!existing)
    return [name, false, 'No suppliers in DB — seed data first with npm run seed'];
  const user = await prisma.user.findFirst();
  if (!user) return [name, false, 'No users in DB — seed data first'];

  try {
    const created = await prisma.supplier.create({
      data: {
        businessName: 'DUPLICADO_TEST_DO_NOT_KEEP',
        nit: existing.nit, // duplicado intencional
        createdById: user.id,
      },
    });
    // No debería llegar aquí; limpiar si la BD aceptó el duplicado.
    await prisma.supplier.delete({ where: { id: created.id } });
    return [name, false, `El constraint UNIQUE sobre nit="${existing.nit}" NO se aplicó.`];
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      return [name, true, `Unique error lanzado como se esperaba para nit="${existing.nit}"`];
    throw e;
  }
}

async function main() {
  console.log('\n=== VALIDATION CHECKS ===\n');
  const checks = [
    checkLowStock,
    checkPasswords,
    checkAuditSession,
    checkSaleTotals,
    checkDuplicateNit,
  ];
  const results: Result[] = [];
  for (const fn of checks) {
    try {
      results.push(await fn());
    } catch (e: any) {
      results.push([fn.name, false, `Unexpected ${e?.name}: ${e?.message}`]);
    }
  }

  for (const [name, passed, detail] of results) {
    console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}`);
    console.log(`         > ${detail}`);
  }
  const nPass = results.filter((r) => r[1]).length;
  console.log(`\n[${nPass === results.length ? 'OK' : 'FAIL'}] ${nPass}/${results.length} checks passed\n`);
  if (nPass !== results.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
