import {
  renderToBuffer,
  drawItemsTable,
  drawTotalLine,
  pesos,
  PdfItemRow,
} from './pdf.util';

export interface CreditNotePdfData {
  creditNoteNumber: string;
  issuedAt: Date;
  customerLabel: string;
  saleId: number;
  invoiceNumber: string | null;
  reason: string;
  items: PdfItemRow[];
  totalRefund: any;
  generatedByName: string;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

/** Genera el PDF de una nota credito (paridad _build_credit_note_pdf). */
export function buildCreditNotePdf(data: CreditNotePdfData): Promise<Buffer> {
  return renderToBuffer((doc) => {
    doc.font('Helvetica-Bold').fontSize(22).text('FERRETERIA');
    doc.fontSize(16).text('NOTA CRÉDITO');
    doc.fontSize(14).text(`No: ${data.creditNoteNumber}`);
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(10);
    doc.text(`Fecha: ${fmtDate(data.issuedAt)}`);
    doc.text(`Cliente: ${data.customerLabel}`);
    doc.text(`Venta referenciada: #${data.saleId}`);
    if (data.invoiceNumber)
      doc.text(`Factura referenciada: ${data.invoiceNumber}`);
    doc.text(`Motivo: ${data.reason}`);
    doc.moveDown(0.8);

    let y = doc.y;
    y = drawItemsTable(
      doc,
      ['Producto', 'Cant. devuelta', 'Precio Unit.', 'Subtotal'],
      data.items,
      y,
    );
    y = drawTotalLine(doc, 'TOTAL REEMBOLSO:', pesos(data.totalRefund), y, true);

    doc.moveDown(2);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Generado por: ${data.generatedByName}`, 56);
  });
}
