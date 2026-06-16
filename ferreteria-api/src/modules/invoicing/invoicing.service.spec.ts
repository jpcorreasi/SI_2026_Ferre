import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomerInvoicesService } from './customer-invoices.service';
import { CreditNotesService } from './credit-notes.service';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { buildInvoicePdf } from './pdf/invoice-pdf';
import { buildCreditNotePdf } from './pdf/credit-note-pdf';

const D = (v: string) => new Prisma.Decimal(v);
const audit = { record: jest.fn(), diff: jest.fn().mockReturnValue({}) };

describe('CustomerInvoicesService', () => {
  let prisma: any;
  let tx: any;
  let service: CustomerInvoicesService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      customerInvoice: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      sale: { findUnique: jest.fn() },
      customerInvoice: { findUnique: jest.fn() },
      creditNote: { count: jest.fn() },
    };
    service = new CustomerInvoicesService(prisma, audit as any);
    jest.clearAllMocks();
  });

  it('create: total = venta - descuento + IVA, numerado FV-', async () => {
    prisma.sale.findUnique.mockResolvedValue({
      id: 5,
      total: D('100000.00'),
      status: 'COMPLETED',
      customerId: 1,
    });
    prisma.customerInvoice.findUnique.mockImplementation(({ where }: any) =>
      where.saleId
        ? Promise.resolve(null) // chequeo duplicado
        : Promise.resolve({
            id: 1,
            invoiceNumber: 'FV-20260615-0001',
            saleId: 5,
            customerId: 1,
            generatedById: 7,
            total: D('95000.00'),
            tax: D('5000.00'),
            discount: D('10000.00'),
            notes: '',
            issuedAt: new Date(),
            sentByEmail: false,
            emailSentTo: '',
            status: 'ISSUED',
          }),
    );

    const res = await service.create(
      { sale: 5, discount: '10000', tax: '5000' } as any,
      { userId: 7, ip: null },
    );

    expect(tx.customerInvoice.create.mock.calls[0][0].data.total.toString()).toBe(
      '95000',
    );
    expect(res.invoice_number).toBe('FV-20260615-0001');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', modelName: 'customerinvoice' }),
    );
  });

  it('create: descuento sobre el 30% -> BadRequest', async () => {
    prisma.sale.findUnique.mockResolvedValue({
      id: 5,
      total: D('100000.00'),
      status: 'COMPLETED',
      customerId: 1,
    });
    prisma.customerInvoice.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ sale: 5, discount: '40000' } as any, {
        userId: 7,
        ip: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create: venta cancelada -> BadRequest', async () => {
    prisma.sale.findUnique.mockResolvedValue({
      id: 5,
      total: D('100000.00'),
      status: 'CANCELLED',
      customerId: 1,
    });
    prisma.customerInvoice.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ sale: 5 } as any, { userId: 7, ip: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CreditNotesService', () => {
  let prisma: any;
  let tx: any;
  let service: CreditNotesService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      creditNote: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      creditNoteItem: { create: jest.fn().mockResolvedValue({}) },
      product: { update: jest.fn().mockResolvedValue({}) },
      transaction: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      sale: { findUnique: jest.fn() },
      saleItem: { findMany: jest.fn() },
      creditNoteItem: { aggregate: jest.fn() },
      customerInvoice: { findUnique: jest.fn().mockResolvedValue(null) },
      customer: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Juan' }) },
      creditNote: { findUnique: jest.fn() },
    };
    service = new CreditNotesService(prisma, audit as any);
    jest.clearAllMocks();
  });

  it('create: restaura stock, calcula reembolso y crea EXPENSE', async () => {
    prisma.sale.findUnique.mockResolvedValue({
      id: 5,
      status: 'COMPLETED',
      customerId: 1,
    });
    prisma.saleItem.findMany.mockResolvedValue([
      {
        id: 12,
        saleId: 5,
        quantity: 3,
        unitPrice: D('15000.00'),
        productId: 3,
        product: { name: 'Martillo' },
      },
    ]);
    prisma.creditNoteItem.aggregate.mockResolvedValue({
      _sum: { quantityReturned: 0 },
    });
    prisma.creditNote.findUnique.mockImplementation(({ where, include }: any) =>
      Promise.resolve(
        include
          ? {
              id: 1,
              creditNoteNumber: 'NC-20260615-0001',
              saleId: 5,
              invoiceId: null,
              invoice: null,
              reason: 'Defectuoso',
              totalRefund: D('30000.00'),
              generatedById: 7,
              generatedBy: { firstName: '', lastName: '', username: 'admin' },
              issuedAt: new Date(),
              status: 'ISSUED',
              items: [],
            }
          : { id: 1, creditNoteNumber: 'NC-20260615-0001' },
      ),
    );

    const res = await service.create(
      { sale: 5, reason: 'Defectuoso', items: [{ sale_item: 12, quantity_returned: 2 }] } as any,
      { userId: 7, ip: null },
    );

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { stock: { increment: 2 } },
    });
    expect(tx.creditNote.update.mock.calls[0][0].data.totalRefund.toString()).toBe(
      '30000',
    );
    const txn = tx.transaction.create.mock.calls[0][0].data;
    expect(txn.type).toBe('EXPENSE');
    expect(txn.referenceType).toBe('CREDIT_NOTE');
    expect(txn.amount.toString()).toBe('30000');
    expect(res.credit_note_number).toBe('NC-20260615-0001');
  });

  it('create: devolver mas de lo disponible -> BadRequest', async () => {
    prisma.sale.findUnique.mockResolvedValue({
      id: 5,
      status: 'COMPLETED',
      customerId: 1,
    });
    prisma.saleItem.findMany.mockResolvedValue([
      {
        id: 12,
        saleId: 5,
        quantity: 3,
        unitPrice: D('15000.00'),
        productId: 3,
        product: { name: 'Martillo' },
      },
    ]);
    prisma.creditNoteItem.aggregate.mockResolvedValue({
      _sum: { quantityReturned: 2 }, // ya devuelto 2, disponible 1
    });
    await expect(
      service.create(
        { sale: 5, reason: 'x', items: [{ sale_item: 12, quantity_returned: 2 }] } as any,
        { userId: 7, ip: null },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });
});

describe('SupplierInvoicesService', () => {
  let prisma: any;
  let tx: any;
  let service: SupplierInvoicesService;

  beforeEach(() => {
    tx = {
      supplierInvoice: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      supplierInvoiceItem: { create: jest.fn().mockResolvedValue({}) },
      product: { update: jest.fn().mockResolvedValue({}) },
      transaction: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      supplierInvoice: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn() },
      supplier: { findUnique: jest.fn().mockResolvedValue({ businessName: 'Ferre' }) },
    };
    service = new SupplierInvoicesService(prisma, audit as any);
    jest.clearAllMocks();
  });

  it('create: incrementa stock y crea Transaction EXPENSE', async () => {
    prisma.supplierInvoice.findUnique.mockResolvedValue({
      id: 1,
      supplierInvoiceNumber: 'FAC-1',
      supplierId: 1,
      supplier: { businessName: 'Ferre' },
      purchaseOrderId: null,
      registeredById: 7,
      registeredBy: { firstName: '', lastName: '', username: 'a' },
      paymentStatus: 'PENDING',
      tax: D('1000.00'),
      total: D('11000.00'),
      receivedAt: new Date('2026-01-01'),
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.create(
      {
        supplier_invoice_number: 'FAC-1',
        supplier: 1,
        received_at: '2026-01-01',
        tax: '1000',
        items: [{ product: 3, quantity: 10, unit_cost: '1000.00' }],
      } as any,
      { userId: 7, ip: null },
    );

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { stock: { increment: 10 } },
    });
    const txn = tx.transaction.create.mock.calls[0][0].data;
    expect(txn.type).toBe('EXPENSE');
    // total = 1000*10 + 1000 (tax) = 11000
    expect(txn.amount.toString()).toBe('11000');
    expect(tx.supplierInvoice.create.mock.calls[0][0].data.total.toString()).toBe(
      '11000',
    );
  });

  it('create: numero duplicado para el proveedor -> BadRequest', async () => {
    prisma.supplierInvoice.findFirst.mockResolvedValue({
      id: 9,
      supplier: { businessName: 'Ferre' },
    });
    await expect(
      service.create(
        {
          supplier_invoice_number: 'FAC-1',
          supplier: 1,
          received_at: '2026-01-01',
          items: [{ product: 3, quantity: 1, unit_cost: '1000.00' }],
        } as any,
        { userId: 7, ip: null },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PDF (pdfkit) genera Buffers', () => {
  it('buildInvoicePdf devuelve un Buffer no vacio', async () => {
    const buf = await buildInvoicePdf({
      invoiceNumber: 'FV-20260615-0001',
      issuedAt: new Date('2026-06-15T10:00:00Z'),
      customerLabel: 'Juan Pérez',
      statusLabel: 'Emitida',
      items: [{ name: 'Martillo', qty: 2, unitPrice: '15000', subtotal: '30000' }],
      grossTotal: '30000',
      discount: '0',
      tax: '0',
      total: '30000',
      notes: 'Gracias',
      generatedByName: 'admin',
    });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('buildCreditNotePdf devuelve un Buffer no vacio', async () => {
    const buf = await buildCreditNotePdf({
      creditNoteNumber: 'NC-20260615-0001',
      issuedAt: new Date('2026-06-15T10:00:00Z'),
      customerLabel: 'Juan Pérez',
      saleId: 5,
      invoiceNumber: 'FV-20260615-0001',
      reason: 'Defectuoso',
      items: [{ name: 'Martillo', qty: 2, unitPrice: '15000', subtotal: '30000' }],
      totalRefund: '30000',
      generatedByName: 'admin',
    });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
