import {
  renderToBuffer,
  drawItemsTable,
  drawTotalLine,
  pesos,
  PdfItemRow,
} from './pdf.util';

export interface InvoicePdfData {
  invoiceNumber: string;
  issuedAt: Date;
  customerLabel: string;
  statusLabel: string;
  items: PdfItemRow[];
  grossTotal: any;
  discount: any;
  tax: any;
  total: any;
  notes: string;
  generatedByName: string;
}

function fmtDate(d: Date): string {
  // 'YYYY-MM-DD HH:MM' como el strftime de Django.
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

/** Genera el PDF de una factura de cliente (paridad _build_invoice_pdf). */
export function buildInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer((doc) => {
    doc.font('Helvetica-Bold').fontSize(22).text('FERRETERIA', { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(14).text(`Factura No: ${data.invoiceNumber}`);
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(10);
    doc.text(`Fecha: ${fmtDate(data.issuedAt)}`);
    doc.text(`Cliente: ${data.customerLabel}`);
    doc.text(`Estado: ${data.statusLabel}`);
    doc.moveDown(0.8);

    let y = doc.y;
    y = drawItemsTable(
      doc,
      ['Producto', 'Cant.', 'Precio Unit.', 'Subtotal'],
      data.items,
      y,
    );

    y = drawTotalLine(doc, 'Subtotal:', pesos(data.grossTotal), y);
    if (Number(data.discount) > 0) {
      y = drawTotalLine(doc, 'Descuento:', `-${pesos(data.discount)}`, y);
      const base = Number(data.grossTotal) - Number(data.discount);
      y = drawTotalLine(doc, 'Base gravable:', pesos(base), y);
    }
    if (Number(data.tax) > 0) {
      y = drawTotalLine(doc, 'IVA:', pesos(data.tax), y);
    }
    y = drawTotalLine(doc, 'TOTAL:', pesos(data.total), y, true);

    if (data.notes) {
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(11).text('Notas:', 56, y + 10);
      doc.font('Helvetica').fontSize(10).text(data.notes, 56);
    }

    doc.moveDown(1.5);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Generado por: ${data.generatedByName}`, 56);
  });
}
