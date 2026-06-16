import PDFDocument from 'pdfkit';

export interface PaymentRow {
  payment_method_name: string;
  sale_count: number;
  total: number;
  percentage: number;
}

export interface ReportData {
  period: { start: string; end: string };
  grand_total: number;
  total_sales: number;
  rows: PaymentRow[];
}

/** "$1,234" (sin decimales, como f'${x:,.0f}' de Django). */
function pesos0(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** PDF de "Ventas por Modalidad de Pago" (paridad SalesByPaymentExportPDFView). */
export function buildSalesByPaymentPdf(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, left: 56, right: 56, bottom: 56 },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(20).text('Ventas por Modalidad de Pago');
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Período: ${data.period.start} — ${data.period.end}`);
    doc.moveDown(0.6);

    if (data.rows.length === 0) {
      doc
        .fontSize(11)
        .text('No hay ventas registradas para el período seleccionado.');
      doc.end();
      return;
    }

    doc
      .fontSize(11)
      .text(
        `Total general: ${pesos0(data.grand_total)}  |  Ventas completadas: ${data.total_sales}`,
      );
    doc.moveDown(0.5);

    const left = 56;
    const cols = [left, left + 200, left + 290, left + 430];
    const right = 510;
    let y = doc.y;

    const header = ['Modalidad de pago', 'N° ventas', 'Total (COP)', '%'];
    doc.rect(left, y - 2, right - left, 18).fill('#1e40af');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
    doc.text(header[0], cols[0] + 4, y + 2);
    doc.text(header[1], cols[1], y + 2, { width: 80, align: 'right' });
    doc.text(header[2], cols[2], y + 2, { width: 130, align: 'right' });
    doc.text(header[3], cols[3], y + 2, { width: 70, align: 'right' });
    y += 20;

    doc.font('Helvetica').fontSize(9).fillColor('#000000');
    let i = 0;
    for (const r of data.rows) {
      if (i % 2 === 1) {
        doc.rect(left, y - 2, right - left, 16).fill('#f1f5f9');
        doc.fillColor('#000000');
      }
      doc.text(r.payment_method_name, cols[0] + 4, y, { width: 190 });
      doc.text(String(r.sale_count), cols[1], y, { width: 80, align: 'right' });
      doc.text(pesos0(r.total), cols[2], y, { width: 130, align: 'right' });
      doc.text(`${r.percentage.toFixed(2)}%`, cols[3], y, {
        width: 70,
        align: 'right',
      });
      y += 16;
      i++;
    }

    // Fila TOTAL.
    doc.rect(left, y - 2, right - left, 16).fill('#e2e8f0');
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9);
    doc.text('TOTAL', cols[0] + 4, y);
    doc.text(String(data.total_sales), cols[1], y, { width: 80, align: 'right' });
    doc.text(pesos0(data.grand_total), cols[2], y, { width: 130, align: 'right' });
    doc.text('100.00%', cols[3], y, { width: 70, align: 'right' });

    doc.end();
  });
}
