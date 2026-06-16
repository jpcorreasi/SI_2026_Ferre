import PDFDocument from 'pdfkit';

/** Formato monetario estilo Django f'${x:,.2f}'  ->  "$1,234.56". */
export function pesos(value: any): string {
  const n = Number(value ?? 0);
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export interface PdfItemRow {
  name: string;
  qty: number;
  unitPrice: any;
  subtotal: any;
}

/** Recoge el stream de PDFKit en un Buffer. */
export function renderToBuffer(
  build: (doc: PDFKit.PDFDocument) => void,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, left: 56, right: 56, bottom: 56 },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

/**
 * Dibuja una tabla simple de items (Producto, Cant., Precio Unit., Subtotal)
 * y devuelve la Y final. Columnas alineadas a la derecha para numeros.
 */
export function drawItemsTable(
  doc: PDFKit.PDFDocument,
  header: string[],
  rows: PdfItemRow[],
  startY: number,
): number {
  const left = 56;
  const cols = [left, left + 240, left + 320, left + 410];
  const right = 540;
  let y = startY;

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff');
  doc.rect(left, y - 2, right - left, 18).fill('#4a4a4a');
  doc.fillColor('#ffffff');
  doc.text(header[0], cols[0] + 4, y + 2);
  doc.text(header[1], cols[1], y + 2, { width: 70, align: 'right' });
  doc.text(header[2], cols[2], y + 2, { width: 80, align: 'right' });
  doc.text(header[3], cols[3], y + 2, { width: 80, align: 'right' });
  y += 20;

  doc.font('Helvetica').fontSize(9).fillColor('#000000');
  for (const r of rows) {
    doc.text(r.name, cols[0] + 4, y, { width: 230 });
    doc.text(String(r.qty), cols[1], y, { width: 70, align: 'right' });
    doc.text(pesos(r.unitPrice), cols[2], y, { width: 80, align: 'right' });
    doc.text(pesos(r.subtotal), cols[3], y, { width: 80, align: 'right' });
    y += 16;
  }
  doc
    .moveTo(left, y)
    .lineTo(right, y)
    .strokeColor('#cccccc')
    .stroke();
  return y + 6;
}

/** Linea de total alineada a la derecha. */
export function drawTotalLine(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  y: number,
  bold = false,
): number {
  doc
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(bold ? 11 : 10)
    .fillColor('#000000');
  doc.text(label, 56 + 320, y, { width: 80, align: 'right' });
  doc.text(value, 56 + 410, y, { width: 80, align: 'right' });
  return y + 16;
}
