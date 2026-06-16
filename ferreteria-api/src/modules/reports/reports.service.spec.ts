import { Prisma } from '@prisma/client';
import { ReportsService } from './reports.service';
import { buildSalesByPaymentPdf } from './sales-by-payment-pdf';

const D = (v: string) => new Prisma.Decimal(v);

describe('ReportsService', () => {
  let prisma: any;
  let service: ReportsService;

  beforeEach(() => {
    prisma = {
      sale: { groupBy: jest.fn(), aggregate: jest.fn() },
      paymentMethod: { findMany: jest.fn() },
      transaction: { aggregate: jest.fn() },
    };
    service = new ReportsService(prisma);
    jest.clearAllMocks();
  });

  describe('resolvePeriod', () => {
    it('today -> start == end', () => {
      const { start, end } = service.resolvePeriod({ period: 'today' });
      expect(start).toBe(end);
      expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('month -> empieza el dia 01', () => {
      const { start } = service.resolvePeriod({ period: 'month' });
      expect(start.endsWith('-01')).toBe(true);
    });

    it('week -> lunes <= domingo y 6 dias de diferencia', () => {
      const { start, end } = service.resolvePeriod({ period: 'week' });
      const ms = new Date(end).getTime() - new Date(start).getTime();
      expect(ms / 86400000).toBe(6);
      expect(new Date(start).getUTCDay()).toBe(1); // lunes
    });

    it('explicito usa start/end', () => {
      const r = service.resolvePeriod({ start: '2026-01-01', end: '2026-01-31' });
      expect(r).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    });
  });

  describe('salesByPaymentJson', () => {
    it('agrega totales, porcentajes y nombres por modalidad', async () => {
      prisma.sale.groupBy.mockResolvedValue([
        { paymentMethodId: 1, _count: { id: 3 }, _sum: { total: D('300000') } },
        { paymentMethodId: 2, _count: { id: 1 }, _sum: { total: D('100000') } },
      ]);
      prisma.paymentMethod.findMany.mockResolvedValue([
        { id: 1, name: 'Efectivo' },
        { id: 2, name: 'Nequi' },
      ]);

      const res = await service.salesByPaymentJson('2026-06-01', '2026-06-30');
      expect(res.grand_total).toBe(400000);
      expect(res.total_sales).toBe(4);
      expect(res.rows[0]).toMatchObject({
        payment_method_id: 1,
        payment_method_name: 'Efectivo',
        sale_count: 3,
        total: 300000,
        percentage: 75,
      });
      expect(res.rows[1].percentage).toBe(25);
    });

    it('grand_total 0 -> porcentaje 0 (sin division por cero)', async () => {
      prisma.sale.groupBy.mockResolvedValue([]);
      prisma.paymentMethod.findMany.mockResolvedValue([]);
      const res = await service.salesByPaymentJson('2026-06-01', '2026-06-30');
      expect(res.grand_total).toBe(0);
      expect(res.rows).toEqual([]);
    });
  });

  describe('financialBalance', () => {
    it('balance = ingresos - egresos', async () => {
      prisma.transaction.aggregate.mockImplementation(({ where }: any) =>
        Promise.resolve({
          _sum: { amount: where.type === 'INCOME' ? D('500000') : D('200000') },
        }),
      );
      const res = await service.financialBalance('06', '2026');
      expect(res.income).toBe(500000);
      expect(res.expense).toBe(200000);
      expect(res.balance).toBe(300000);
      expect(res.filters).toEqual({ month: '06', year: '2026' });
    });
  });

  describe('salesSummary', () => {
    it('devuelve revenue, count y ticket promedio', async () => {
      prisma.sale.aggregate.mockResolvedValue({
        _sum: { total: D('1000000') },
        _count: { id: 8 },
        _avg: { total: D('125000') },
      });
      const res = await service.salesSummary('2026-06-01', '2026-06-30');
      expect(res.total_revenue).toBe(1000000);
      expect(res.sale_count).toBe(8);
      expect(res.average_ticket).toBe(125000);
    });
  });

  describe('buildCsv', () => {
    it('incluye BOM, encabezados y fila TOTAL', () => {
      const csv = service.buildCsv({
        period: { start: '2026-06-01', end: '2026-06-30' },
        grand_total: 400000,
        total_sales: 4,
        rows: [
          { payment_method_name: 'Efectivo', sale_count: 3, total: 300000, percentage: 75 },
        ],
      });
      expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
      expect(csv).toContain('Modalidad de pago');
      expect(csv).toContain('TOTAL,4,400000.00,100.00');
    });
  });
});

describe('buildSalesByPaymentPdf', () => {
  it('devuelve un Buffer PDF', async () => {
    const buf = await buildSalesByPaymentPdf({
      period: { start: '2026-06-01', end: '2026-06-30' },
      grand_total: 400000,
      total_sales: 4,
      rows: [
        { payment_method_name: 'Efectivo', sale_count: 3, total: 300000, percentage: 75 },
        { payment_method_name: 'Nequi', sale_count: 1, total: 100000, percentage: 25 },
      ],
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('sin filas tambien genera PDF', async () => {
    const buf = await buildSalesByPaymentPdf({
      period: { start: '2026-06-01', end: '2026-06-30' },
      grand_total: 0,
      total_sales: 0,
      rows: [],
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
