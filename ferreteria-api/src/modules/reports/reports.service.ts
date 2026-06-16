import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  bogotaTodayStr,
  bogotaDayStart,
  bogotaDayEnd,
  parseDateOnly,
} from '../../common/utils/dates';
import { ReportData, PaymentRow } from './sales-by-payment-pdf';

function num(d: Prisma.Decimal | number | null | undefined): number {
  return d == null ? 0 : Number(d);
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Helpers de periodo / fechas (sensibles a TZ America/Bogota)
  // -------------------------------------------------------------------------
  private saleDateFilter(start?: string, end?: string): Prisma.DateTimeFilter | undefined {
    const f: Prisma.DateTimeFilter = {};
    if (start) f.gte = bogotaDayStart(start);
    if (end) f.lte = bogotaDayEnd(end);
    return f.gte || f.lte ? f : undefined;
  }

  /** Paridad _resolve_period: period today|week|month, o start/end, o mes actual. */
  resolvePeriod(q: any): { start: string; end: string } {
    const period = q.period;
    const today = bogotaTodayStr();

    if (period === 'today') return { start: today, end: today };
    if (period === 'week') {
      const d = new Date(`${today}T00:00:00.000Z`);
      const mondayOffset = (d.getUTCDay() + 6) % 7; // Lunes = 0
      const monday = new Date(d.getTime() - mondayOffset * 86400000);
      const sunday = new Date(monday.getTime() + 6 * 86400000);
      return {
        start: monday.toISOString().slice(0, 10),
        end: sunday.toISOString().slice(0, 10),
      };
    }
    if (period === 'month') {
      const [y, m] = today.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const mm = String(m).padStart(2, '0');
      return {
        start: `${y}-${mm}-01`,
        end: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
      };
    }

    const start = q.start || `${today.slice(0, 7)}-01`;
    const end = q.end || today;
    return { start, end };
  }

  // -------------------------------------------------------------------------
  // sales-summary
  // -------------------------------------------------------------------------
  async salesSummary(start?: string, end?: string) {
    const saleDate = this.saleDateFilter(start, end);
    const agg = await this.prisma.sale.aggregate({
      where: { status: 'COMPLETED', ...(saleDate ? { saleDate } : {}) },
      _sum: { total: true },
      _count: { id: true },
      _avg: { total: true },
    });
    return {
      total_revenue: num(agg._sum.total),
      sale_count: agg._count.id,
      average_ticket: num(agg._avg.total),
      filters: { start: start ?? null, end: end ?? null },
    };
  }

  // -------------------------------------------------------------------------
  // top-products
  // -------------------------------------------------------------------------
  async topProducts(limitRaw: any) {
    let limit = parseInt(limitRaw, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 10;

    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      select: { id: true, code: true, name: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return grouped.map((g) => ({
      product__id: g.productId,
      product__code: byId.get(g.productId)?.code ?? null,
      product__name: byId.get(g.productId)?.name ?? null,
      total_quantity: g._sum.quantity ?? 0,
      total_revenue: num(g._sum.subtotal),
    }));
  }

  // -------------------------------------------------------------------------
  // low-stock
  // -------------------------------------------------------------------------
  async lowStock() {
    const rows = await this.prisma.product.findMany({
      include: { supplier: true, category: true },
      orderBy: { stock: 'asc' },
    });
    return rows
      .filter((p) => p.stock <= p.minStock)
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        stock: p.stock,
        min_stock: p.minStock,
        category: p.category?.name ?? null,
        supplier: p.supplier?.businessName ?? null,
      }));
  }

  // -------------------------------------------------------------------------
  // financial-balance (ADMIN)
  // -------------------------------------------------------------------------
  async financialBalance(month?: string, year?: string) {
    let where: Prisma.TransactionWhereInput = {};
    if (month && year) {
      const y = Number(year);
      const m = Number(month);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      where = {
        transactionDate: {
          gte: parseDateOnly(`${y}-${String(m).padStart(2, '0')}-01`),
          lte: parseDateOnly(
            `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
          ),
        },
      };
    } else if (year) {
      where = {
        transactionDate: {
          gte: parseDateOnly(`${year}-01-01`),
          lte: parseDateOnly(`${year}-12-31`),
        },
      };
    }

    const [inc, exp] = await Promise.all([
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...where, type: 'INCOME' },
      }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...where, type: 'EXPENSE' },
      }),
    ]);
    const income = num(inc._sum.amount);
    const expense = num(exp._sum.amount);
    return {
      income,
      expense,
      balance: income - expense,
      filters: { month: month ?? null, year: year ?? null },
    };
  }

  // -------------------------------------------------------------------------
  // sales-by-payment (ADMIN) + exports
  // -------------------------------------------------------------------------
  async salesByPayment(start: string, end: string): Promise<ReportData> {
    const saleDate = this.saleDateFilter(start, end);
    const grouped = await this.prisma.sale.groupBy({
      by: ['paymentMethodId'],
      where: { status: 'COMPLETED', ...(saleDate ? { saleDate } : {}) },
      _count: { id: true },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
    });

    const methods = await this.prisma.paymentMethod.findMany({
      where: { id: { in: grouped.map((g) => g.paymentMethodId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(methods.map((m) => [m.id, m.name]));

    const grandTotal = grouped.reduce((acc, g) => acc + num(g._sum.total), 0);
    const totalSales = grouped.reduce((acc, g) => acc + g._count.id, 0);

    const rows: PaymentRow[] = grouped.map((g) => {
      const total = num(g._sum.total);
      const pct = grandTotal
        ? Number(((total / grandTotal) * 100).toFixed(2))
        : 0;
      return {
        payment_method_name: nameById.get(g.paymentMethodId) ?? '—',
        sale_count: g._count.id,
        total,
        percentage: pct,
      };
    });

    return {
      period: { start, end },
      grand_total: grandTotal,
      total_sales: totalSales,
      rows,
    };
  }

  /** Igual que salesByPayment pero incluye payment_method_id (respuesta JSON). */
  async salesByPaymentJson(start: string, end: string) {
    const saleDate = this.saleDateFilter(start, end);
    const grouped = await this.prisma.sale.groupBy({
      by: ['paymentMethodId'],
      where: { status: 'COMPLETED', ...(saleDate ? { saleDate } : {}) },
      _count: { id: true },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
    });
    const methods = await this.prisma.paymentMethod.findMany({
      where: { id: { in: grouped.map((g) => g.paymentMethodId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(methods.map((m) => [m.id, m.name]));
    const grandTotal = grouped.reduce((acc, g) => acc + num(g._sum.total), 0);
    const totalSales = grouped.reduce((acc, g) => acc + g._count.id, 0);
    return {
      period: { start, end },
      grand_total: grandTotal,
      total_sales: totalSales,
      rows: grouped.map((g) => {
        const total = num(g._sum.total);
        return {
          payment_method_id: g.paymentMethodId,
          payment_method_name: nameById.get(g.paymentMethodId) ?? '—',
          sale_count: g._count.id,
          total,
          percentage: grandTotal
            ? Number(((total / grandTotal) * 100).toFixed(2))
            : 0,
        };
      }),
    };
  }

  /** CSV con BOM UTF-8 (Excel). */
  buildCsv(data: ReportData): string {
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const line = (fields: (string | number)[]) => fields.map(esc).join(',');
    const lines = [
      line(['Reporte: Ventas por modalidad de pago']),
      line([`Período: ${data.period.start} — ${data.period.end}`]),
      '',
      line(['Modalidad de pago', 'Núm. ventas', 'Total (COP)', 'Porcentaje (%)']),
      ...data.rows.map((r) =>
        line([
          r.payment_method_name,
          r.sale_count,
          r.total.toFixed(2),
          r.percentage.toFixed(2),
        ]),
      ),
      '',
      line(['TOTAL', data.total_sales, data.grand_total.toFixed(2), '100.00']),
    ];
    return '﻿' + lines.join('\r\n') + '\r\n';
  }
}
