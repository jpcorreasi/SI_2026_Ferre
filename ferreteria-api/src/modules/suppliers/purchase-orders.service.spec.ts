import { BadRequestException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';

function makeTx() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    purchaseOrder: {
      create: jest.fn().mockResolvedValue({ id: 50 }),
      update: jest.fn().mockResolvedValue({ id: 50, status: 'RECEIVED' }),
    },
    purchaseOrderItem: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([
        { productId: 3, quantity: 5 },
        { productId: 5, quantity: 2 },
      ]),
    },
    product: { update: jest.fn().mockResolvedValue({}) },
  };
}

const audit = { record: jest.fn(), diff: jest.fn().mockReturnValue({}) };

describe('PurchaseOrdersService (stock en RECEIVED)', () => {
  let tx: ReturnType<typeof makeTx>;
  let prisma: any;
  let service: PurchaseOrdersService;

  beforeEach(() => {
    tx = makeTx();
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      purchaseOrder: { findUnique: jest.fn(), delete: jest.fn() },
    };
    service = new PurchaseOrdersService(prisma, audit as any);
    jest.clearAllMocks();
  });

  const fullOrder = (status: string) => ({
    id: 50,
    supplierId: 1,
    supplier: { businessName: 'Ferreimportados' },
    status,
    notes: '',
    items: [],
    createdById: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('receive: incrementa stock de cada item y marca RECEIVED', async () => {
    prisma.purchaseOrder.findUnique
      .mockResolvedValueOnce({ id: 50, status: 'SENT' }) // guard
      .mockResolvedValueOnce(fullOrder('RECEIVED')); // retrieve final

    await service.receive(50);

    const incs = tx.product.update.mock.calls.map((c: any) => [
      c[0].where.id,
      c[0].data.stock.increment,
    ]);
    expect(incs).toEqual(expect.arrayContaining([[3, 5], [5, 2]]));
    expect(tx.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { status: 'RECEIVED' },
    });
  });

  it('receive: orden ya recibida -> BadRequest', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValueOnce({
      id: 50,
      status: 'RECEIVED',
    });
    await expect(service.receive(50)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('receive: orden cancelada -> BadRequest', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValueOnce({
      id: 50,
      status: 'CANCELLED',
    });
    await expect(service.receive(50)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update: transicion SENT->RECEIVED incrementa stock', async () => {
    prisma.purchaseOrder.findUnique
      .mockResolvedValueOnce({ id: 50, status: 'SENT' }) // before
      .mockResolvedValueOnce(fullOrder('RECEIVED')); // retrieve final

    await service.update(50, { status: 'RECEIVED' } as any, {
      userId: 7,
      ip: null,
    });

    expect(tx.purchaseOrderItem.findMany).toHaveBeenCalled();
    expect(tx.product.update).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', modelName: 'purchaseorder' }),
    );
  });

  it('update: cambio de notas (sin status) NO toca stock', async () => {
    prisma.purchaseOrder.findUnique
      .mockResolvedValueOnce({ id: 50, status: 'DRAFT' }) // before
      .mockResolvedValueOnce(fullOrder('DRAFT')); // retrieve final

    await service.update(50, { notes: 'urgente' } as any, {
      userId: 7,
      ip: null,
    });

    expect(tx.purchaseOrderItem.findMany).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('create: orden en DRAFT, sin efecto en stock', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValueOnce(fullOrder('DRAFT'));
    await service.create(
      {
        supplier: 1,
        items: [{ product: 3, quantity: 5, unit_cost: '1000.00' }],
      } as any,
      { userId: 7, ip: null },
    );
    expect(tx.purchaseOrder.create.mock.calls[0][0].data.status).toBe('DRAFT');
    expect(tx.product.update).not.toHaveBeenCalled();
  });
});
