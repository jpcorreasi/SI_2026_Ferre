/**
 * ETL · Paso 2 — Import de etl/dump.json a PostgreSQL (vía Prisma)
 * ===============================================================
 * Inserta en orden de dependencias, preservando los id originales (para que
 * las FKs encajen) y reseteando las secuencias al final de cada tabla.
 *
 * El casteo de tipos se deriva en runtime de information_schema (udt_name), así
 * que enums, jsonb, booleanos, fechas y decimales se convierten correctamente
 * sin mapear columna por columna. Los tokens Fernet de document_number se
 * copian tal cual (el backend los descifra con la MISMA FIELD_ENCRYPTION_KEY).
 *
 * Idempotente: hace TRUNCATE ... RESTART IDENTITY CASCADE antes de insertar.
 *
 * Uso (desde ferreteria-api/):
 *     npm run etl:import            # usa ../etl/dump.json
 *     npm run etl:import -- ruta/al/dump.json
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Orden padre -> hijo (respeta las FKs).
const TABLES = [
  'accounts_customuser',
  'accounts_auditsession',
  'customers_customer',
  'suppliers_supplier',
  'products_category',
  'products_product',
  'suppliers_purchaseorder',
  'suppliers_purchaseorderitem',
  'suppliers_orderrequest',
  'suppliers_orderrequestitem',
  'sales_paymentmethod',
  'sales_sale',
  'sales_saleitem',
  'employees_employee',
  'employees_payroll',
  'employees_payrollitem',
  'employees_workschedule',
  'employees_workshift',
  'invoicing_customerinvoice',
  'invoicing_creditnote',
  'invoicing_creditnoteitem',
  'invoicing_supplierinvoice',
  'invoicing_supplierinvoiceitem',
  'finances_transaction',
  'finances_cashregister',
  'finances_expensecategory',
  'finances_expense',
  'services_servicetype',
  'services_service',
  'audit_auditlog',
];

interface Column {
  column_name: string;
  udt_name: string;
}

function toParam(value: unknown, udt: string): string | null {
  if (value === null || value === undefined) return null;
  if (udt === 'bool') {
    return value === true || value === 1 || value === '1' || value === 't' || value === 'true'
      ? 'true'
      : 'false';
  }
  if (udt === 'jsonb' || udt === 'json') {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return String(value);
}

async function columnsOf(table: string): Promise<Column[]> {
  return prisma.$queryRawUnsafe<Column[]>(
    `SELECT column_name, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    table,
  );
}

async function main() {
  const dumpPath = resolve(process.argv[2] ?? '../etl/dump.json');
  console.log(`\nLeyendo dump: ${dumpPath}`);
  const dump = JSON.parse(readFileSync(dumpPath, 'utf-8')) as Record<string, any[]>;

  // Las fechas sin offset (UTC naive) se interpretan como UTC.
  await prisma.$executeRawUnsafe(`SET TIME ZONE 'UTC'`);

  // Limpieza idempotente.
  const quoted = TABLES.map((t) => `"${t}"`).join(', ');
  console.log('TRUNCATE (RESTART IDENTITY CASCADE)...');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);

  let grand = 0;
  for (const table of TABLES) {
    const rows = dump[table] ?? [];
    if (rows.length === 0) {
      console.log(`  ${table.padEnd(32)}      0 filas (omitida)`);
      continue;
    }
    const cols = await columnsOf(table);
    const colList = cols.map((c) => `"${c.column_name}"`).join(', ');
    const placeholders = cols
      .map((c, i) => `$${i + 1}::"${c.udt_name}"`)
      .join(', ');
    const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;

    for (const row of rows) {
      const params = cols.map((c) => toParam(row[c.column_name], c.udt_name));
      await prisma.$executeRawUnsafe(sql, ...params);
    }

    // Reseteo de la secuencia del id al máximo insertado.
    await prisma.$queryRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'),
                     (SELECT MAX(id) FROM "${table}"))`,
    );

    grand += rows.length;
    console.log(`  ${table.padEnd(32)} ${String(rows.length).padStart(6)} filas OK`);
  }

  console.log(`\n[OK] ${grand} filas importadas en ${TABLES.length} tablas.\n`);
}

main()
  .catch((e) => {
    console.error('\n[ERROR] El import falló:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
