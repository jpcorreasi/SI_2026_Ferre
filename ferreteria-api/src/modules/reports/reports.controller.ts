import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { buildSalesByPaymentPdf } from './sales-by-payment-pdf';

/** /api/reports/ — analítica. Algunos endpoints son ADMIN-only. */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales-summary')
  salesSummary(@Query('start') start?: string, @Query('end') end?: string) {
    return this.reports.salesSummary(start, end);
  }

  @Get('top-products')
  topProducts(@Query('limit') limit?: string) {
    return this.reports.topProducts(limit);
  }

  @Get('low-stock')
  lowStock() {
    return this.reports.lowStock();
  }

  @Roles('ADMIN')
  @Get('financial-balance')
  financialBalance(
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.reports.financialBalance(month, year);
  }

  @Roles('ADMIN')
  @Get('sales-by-payment')
  salesByPayment(@Query() query: any) {
    const { start, end } = this.reports.resolvePeriod(query);
    return this.reports.salesByPaymentJson(start, end);
  }

  @Roles('ADMIN')
  @Get('sales-by-payment/export-csv')
  async exportCsv(@Query() query: any, @Res() res: Response) {
    const { start, end } = this.reports.resolvePeriod(query);
    const data = await this.reports.salesByPayment(start, end);
    const csv = this.reports.buildCsv(data);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ventas_por_pago_${start}_${end}.csv"`,
    });
    res.send(csv);
  }

  @Roles('ADMIN')
  @Get('sales-by-payment/export-pdf')
  async exportPdf(@Query() query: any, @Res() res: Response) {
    const { start, end } = this.reports.resolvePeriod(query);
    const data = await this.reports.salesByPayment(start, end);
    const buffer = await buildSalesByPaymentPdf(data);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ventas_por_pago_${start}_${end}.pdf"`,
    });
    res.send(buffer);
  }
}
