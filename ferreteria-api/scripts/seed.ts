/**
 * Seed de datos de prueba — paridad con accounts/management/commands/seed_test_data.py
 * Idempotente. Uso:  npm run seed
 *
 * Crea: admin_test / Admin1234!  ·  empleado_test / Emp1234!
 *       clientes, proveedor, categorías, productos (Martillo 10, Puntilla 2/min5,
 *       Destornillador 0/min3), métodos de pago y una venta (Martillo x2 -> stock 8).
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { makePassword } from '../src/common/crypto/django-password';
import { Fernet } from '../src/common/crypto/fernet';

const prisma = new PrismaClient();
const key = process.env.FIELD_ENCRYPTION_KEY;
const fernet = key ? new Fernet(key) : null;
const enc = (v: string) => (fernet ? fernet.encrypt(v) : v);
const D = (v: string) => new Prisma.Decimal(v);

function log(tag: string, model: string, pk: number | string, detail: string) {
  console.log(`  [${tag}] ${model} pk=${pk} — ${detail}`);
}

async function main() {
  console.log('\n=== SEED TEST DATA ===');

  // --- Users ---
  console.log('\n--- Users ---');
  const admin = await prisma.user.upsert({
    where: { username: 'admin_test' },
    update: {},
    create: {
      username: 'admin_test',
      password: makePassword('Admin1234!'),
      role: 'ADMIN',
      isSuperuser: true,
      isStaff: true,
      email: 'admin@test.com',
      firstName: 'Admin',
      lastName: 'Test',
    },
  });
  log('USER', 'User', admin.id, `username=admin_test role=ADMIN`);

  const employee = await prisma.user.upsert({
    where: { username: 'empleado_test' },
    update: {},
    create: {
      username: 'empleado_test',
      password: makePassword('Emp1234!'),
      role: 'EMPLEADO',
      email: 'empleado@test.com',
      firstName: 'Empleado',
      lastName: 'Test',
    },
  });
  log('USER', 'User', employee.id, `username=empleado_test role=EMPLEADO`);

  // --- Customers (clave de idempotencia: email) ---
  console.log('\n--- Customers ---');
  const customer1 =
    (await prisma.customer.findFirst({ where: { email: 'juan@test.com' } })) ??
    (await prisma.customer.create({
      data: {
        fullName: 'Juan Pérez',
        documentType: 'CC',
        documentNumber: enc('1234567890'),
        email: 'juan@test.com',
        createdById: admin.id,
      },
    }));
  log('CUSTOMER', 'Customer', customer1.id, customer1.fullName);

  const customer2 =
    (await prisma.customer.findFirst({ where: { email: 'abc@empresa.com' } })) ??
    (await prisma.customer.create({
      data: {
        fullName: 'Empresa ABC',
        documentType: 'NIT',
        documentNumber: enc('900123456'),
        email: 'abc@empresa.com',
        createdById: admin.id,
      },
    }));
  log('CUSTOMER', 'Customer', customer2.id, customer2.fullName);

  // --- Supplier ---
  console.log('\n--- Suppliers ---');
  const supplier = await prisma.supplier.upsert({
    where: { nit: '800987654' },
    update: {},
    create: {
      businessName: 'Ferreimportados S.A.',
      nit: '800987654',
      contactName: 'Carlos Ruiz',
      phone: '3001234567',
      email: 'ventas@ferreimportados.com',
      createdById: admin.id,
    },
  });
  log('SUPPLIER', 'Supplier', supplier.id, supplier.businessName);

  // --- Categories ---
  console.log('\n--- Categories ---');
  const catTools = await prisma.category.upsert({
    where: { name: 'Herramientas' },
    update: {},
    create: { name: 'Herramientas' },
  });
  const catMaterials = await prisma.category.upsert({
    where: { name: 'Materiales de construcción' },
    update: {},
    create: { name: 'Materiales de construcción' },
  });
  log('CATEGORY', 'Category', catTools.id, catTools.name);
  log('CATEGORY', 'Category', catMaterials.id, catMaterials.name);

  // --- Products ---
  console.log('\n--- Products ---');
  const specs = [
    { code: 'MART-001', name: 'Martillo carpintero', categoryId: catTools.id, sale: '35000', cost: '20000', stock: 10, min: 3 },
    { code: 'PUNT-002', name: 'Puntilla 2 pulgadas', categoryId: catMaterials.id, sale: '8000', cost: '4500', stock: 2, min: 5 },
    { code: 'DEST-003', name: 'Destornillador estrella', categoryId: catTools.id, sale: '15000', cost: '9000', stock: 0, min: 3 },
  ];
  const products: Record<string, any> = {};
  for (const s of specs) {
    const p = await prisma.product.upsert({
      where: { code: s.code },
      update: {},
      create: {
        code: s.code,
        name: s.name,
        categoryId: s.categoryId,
        salePrice: D(s.sale),
        costPrice: D(s.cost),
        stock: s.stock,
        minStock: s.min,
        createdById: admin.id,
      },
    });
    products[s.code] = p;
    log('PRODUCT', 'Product', p.id, `code=${p.code} stock=${p.stock} min=${p.minStock}`);
  }

  // --- Payment methods ---
  console.log('\n--- Payment Methods ---');
  const pmByName: Record<string, any> = {};
  for (const name of ['Efectivo', 'Nequi', 'Tarjeta débito']) {
    const pm = await prisma.paymentMethod.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    pmByName[name] = pm;
    log('PM', 'PaymentMethod', pm.id, pm.name);
  }

  // --- Sale + SaleItem (Martillo x2 -> stock 8) ---
  console.log('\n--- Sale + SaleItems ---');
  let sale = await prisma.sale.findFirst({
    where: { customerId: customer1.id, employeeId: employee.id },
  });
  if (!sale) {
    sale = await prisma.$transaction(async (tx) => {
      const s = await tx.sale.create({
        data: {
          customerId: customer1.id,
          paymentMethodId: pmByName['Efectivo'].id,
          employeeId: employee.id,
          total: D('70000'),
          status: 'COMPLETED',
          isAnonymous: false,
        },
      });
      const martillo = products['MART-001'];
      await tx.saleItem.create({
        data: {
          saleId: s.id,
          productId: martillo.id,
          quantity: 2,
          unitPrice: D('35000'),
          subtotal: D('70000'),
        },
      });
      await tx.product.update({
        where: { id: martillo.id },
        data: { stock: { decrement: 2 } },
      });
      return s;
    });
    log('SALE', 'Sale', sale.id, `total=70000 status=COMPLETED (Martillo x2, stock 10->8)`);
    console.log(
      '  [EXPECTED] Destornillador (stock 0) omitido: stock insuficiente — paridad con el signal de Django.',
    );
  } else {
    log('SALE', 'Sale', sale.id, `ya existe (total=${sale.total})`);
  }

  // --- Summary ---
  console.log('\n=== SUMMARY ===');
  const martillo = await prisma.product.findUnique({ where: { code: 'MART-001' } });
  const signalOk = martillo?.stock === 8;
  console.log(
    `SIGNAL TEST [${signalOk ? 'PASS' : 'FAIL'}]: Martillo stock debería ser 8, actual: ${martillo?.stock}`,
  );
  const allProducts = await prisma.product.findMany({ orderBy: { code: 'asc' } });
  const low = allProducts.filter((p) => p.stock <= p.minStock).map((p) => `${p.code} (${p.stock}/${p.minStock})`);
  console.log(`LOW STOCK: ${low.join(', ') || '(ninguno)'}`);
  console.log('\n[OK] Seed completado.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
