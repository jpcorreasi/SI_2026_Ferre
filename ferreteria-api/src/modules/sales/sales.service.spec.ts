import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SalesService } from './sales.service';

const D = (v: string) => new Prisma.Decimal(v);

function makeTx() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    product: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue({ id: 1, fullName: 'Juan Pérez' }),
    },
    sale: {
      create: jest.fn().mockResolvedValue({ id: 99 }),
      update: jest.fn().mockResolvedValue({}),
    },
    saleItem: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn() },
    transaction: {
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    },
  };
}

const audit = { record: jest.fn(), diff: jest.fn().mockReturnValue({}) };

describe('SalesService (logica atomica)', () => {
  let tx: ReturnType<typeof makeTx>;
  let prisma: any;
  let service: SalesService;

  beforeEach(() => {
    tx = makeTx();
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      sale: { findUnique: jest.fn(), delete: jest.fn() },
    };
    service = new SalesService(prisma, audit as any);
    jest.clearAllMocks();
  });

  it('create: calcula total, descuenta stock y crea Transaction INCOME', async () => {
    tx.product.findMany.mockResolvedValue([
      { id: 3, name: 'Martillo', stock: 10, salePrice: D('15000.00') },
      { id: 5, name: 'Destornillador', stock: 4, salePrice: D('20000.00') },
    ]);
    // retrieve() final
    prisma.sale.findUnique.mockResolvedValue({
      id: 99,
      customerId: 1,
      customer: { fullName: 'Juan Pérez', email: 'j@x.co' },
      paymentMethodId: 1,
      paymentMethod: { name: 'Efectivo' },
      employeeId: 7,
      total: D('50000.00'),
      status: 'COMPLETED',
      isAnonymous: false,
      saleDate: new Date(),
      items: [],
      invoice: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await service.create(
      {
        customer: 1,
        payment_method: 1,
        items: [
          { product: 3, quantity: 2 },
          { product: 5, quantity: 1 },
        ],
      } as any,
      { userId: 7, ip: '1.2.3.4' },
    );

    // total = 15000*2 + 20000*1 = 50000
    expect(tx.sale.create).toHaveBeenCalledTimes(1);
    expect(tx.sale.create.mock.calls[0][0].data.total.toString()).toBe('50000');
    expect(tx.sale.create.mock.calls[0][0].data.status).toBe('COMPLETED');
    expect(tx.sale.create.mock.calls[0][0].data.employeeId).toBe(7);

    // dos lineas -> dos SaleItem
    expect(tx.saleItem.create).toHaveBeenCalledTimes(2);

    // decremento por producto
    const decrements = tx.product.update.mock.calls.map((c: any) => [
      c[0].where.id,
      c[0].data.stock.decrement,
    ]);
    expect(decrements).toEqual(
      expect.arrayContaining([
        [3, 2],
        [5, 1],
      ]),
    );

    // Transaction INCOME por el total
    expect(tx.transaction.create).toHaveBeenCalledTimes(1);
    const txn = tx.transaction.create.mock.calls[0][0].data;
    expect(txn.type).toBe('INCOME');
    expect(txn.referenceType).toBe('SALE');
    expect(txn.referenceId).toBe(99);
    expect(txn.amount.toString()).toBe('50000');

    // auditoria CREATE
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', modelName: 'sale' }),
    );
    expect(res.id).toBe(99);
  });

  it('create: stock insuficiente -> BadRequest y no crea la venta', async () => {
    tx.product.findMany.mockResolvedValue([
      { id: 3, name: 'Martillo', stock: 1, salePrice: D('15000.00') },
    ]);

    await expect(
      service.create(
        { payment_method: 1, items: [{ product: 3, quantity: 5 }] } as any,
        { userId: 7, ip: null },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.sale.create).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('cancel: restaura stock y crea Transaction EXPENSE de reversa', async () => {
    const sale = {
      id: 99,
      status: 'COMPLETED',
      total: D('50000.00'),
      employeeId: 7,
      customer: { fullName: 'Juan Pérez' },
      customerId: 1,
      items: [
        { productId: 3, quantity: 2 },
        { productId: 5, quantity: 1 },
      ],
    };
    prisma.sale.findUnique
      .mockResolvedValueOnce(sale) // getFull al inicio
      .mockResolvedValueOnce({
        ...sale,
        status: 'CANCELLED',
        paymentMethodId: 1,
        paymentMethod: { name: 'Efectivo' },
        isAnonymous: false,
        saleDate: new Date(),
        items: [],
        invoice: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }); // retrieve final

    await service.cancel(99);

    // stock restaurado (increment) por producto
    const increments = tx.product.update.mock.calls.map((c: any) => [
      c[0].where.id,
      c[0].data.stock.increment,
    ]);
    expect(increments).toEqual(
      expect.arrayContaining([
        [3, 2],
        [5, 1],
      ]),
    );

    expect(tx.sale.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { status: 'CANCELLED' },
    });

    const txn = tx.transaction.create.mock.calls[0][0].data;
    expect(txn.type).toBe('EXPENSE');
    expect(txn.amount.toString()).toBe('50000');
    expect(txn.concept).toContain('Anulación Venta #99');
  });

  it('cancel: venta ya cancelada -> BadRequest', async () => {
    prisma.sale.findUnique.mockResolvedValueOnce({
      id: 99,
      status: 'CANCELLED',
      items: [],
    });
    await expect(service.cancel(99)).rejects.toBeInstanceOf(BadRequestException);
  });
});
