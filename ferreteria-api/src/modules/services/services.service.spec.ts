import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ServicesService } from './services.service';

const D = (v: string) => new Prisma.Decimal(v);
const audit = { record: jest.fn(), diff: jest.fn().mockReturnValue({}) };

describe('ServicesService', () => {
  let prisma: any;
  let tx: any;
  let service: ServicesService;

  beforeEach(() => {
    tx = {
      service: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      transaction: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      serviceType: { findUnique: jest.fn() },
      customer: { findUnique: jest.fn() },
      service: { findUnique: jest.fn() },
    };
    service = new ServicesService(prisma, audit as any);
    jest.clearAllMocks();
  });

  it('create: crea servicio y Transaction INCOME con concepto correcto', async () => {
    prisma.serviceType.findUnique.mockResolvedValue({ id: 2, name: 'Reparación' });
    prisma.customer.findUnique.mockResolvedValue({ fullName: 'Juan Pérez' });
    prisma.service.findUnique.mockResolvedValue({
      id: 1,
      serviceTypeId: 2,
      serviceType: { name: 'Reparación' },
      description: 'Cambio de chapa',
      price: D('80000.00'),
      customerId: 3,
      customer: { fullName: 'Juan Pérez' },
      performedById: 7,
      performedBy: { firstName: 'Ada', lastName: 'Min' },
      serviceDate: new Date('2026-06-15'),
      notes: '',
      registeredById: 7,
      registeredBy: { username: 'admin' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await service.create(
      {
        service_type: 2,
        description: 'Cambio de chapa',
        price: '80000',
        customer: 3,
        performed_by: 7,
        service_date: '2026-06-15',
      } as any,
      { userId: 7, ip: null },
    );

    const data = tx.transaction.create.mock.calls[0][0].data;
    expect(data.type).toBe('INCOME');
    expect(data.referenceType).toBe('SERVICE');
    expect(data.referenceId).toBe(1);
    expect(data.amount.toString()).toBe('80000');
    expect(data.concept).toBe('Servicio #1 — Reparación | Juan Pérez');
    expect(res.performed_by_name).toBe('Ada Min');
  });

  it('create: sin cliente usa "Sin cliente" en el concepto', async () => {
    prisma.serviceType.findUnique.mockResolvedValue({ id: 2, name: 'Reparación' });
    prisma.service.findUnique.mockResolvedValue({
      id: 1,
      serviceTypeId: 2,
      serviceType: { name: 'Reparación' },
      description: 'x',
      price: D('50000.00'),
      customerId: null,
      customer: null,
      performedById: 7,
      performedBy: { firstName: '', lastName: '' },
      serviceDate: new Date('2026-06-15'),
      notes: '',
      registeredById: 7,
      registeredBy: { username: 'admin' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.create(
      { service_type: 2, description: 'x', price: '50000', performed_by: 7, service_date: '2026-06-15' } as any,
      { userId: 7, ip: null },
    );
    expect(tx.transaction.create.mock.calls[0][0].data.concept).toBe(
      'Servicio #1 — Reparación | Sin cliente',
    );
  });

  it('create: precio <= 0 -> BadRequest', async () => {
    await expect(
      service.create(
        { service_type: 2, description: 'x', price: '0', performed_by: 7, service_date: '2026-06-15' } as any,
        { userId: 7, ip: null },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
