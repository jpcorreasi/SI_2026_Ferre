import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { money, dt } from '../../common/serialization/format';
import { listPaginated } from '../../common/crud/list.helper';
import { bogotaToday, utcDateCompact } from '../../common/utils/dates';
import { nextDailyNumber } from '../../common/utils/numbering';
import { buildCreditNotePdf } from './pdf/credit-note-pdf';
import { CreateCreditNoteDto } from './dto/credit-note.dto';

const APP = 'invoicing';
const MODEL = 'creditnote';

const INCLUDE = {
  items: { include: { product: true }, orderBy: { id: 'asc' } },
  generatedBy: true,
  invoice: true,
  sale: { include: { customer: true } },
} as const;

function fullName(u: { firstName: string; lastName: string; username: string }) {
  return `${u.firstName} ${u.lastName}`.trim() || u.username;
}

@Injectable()
export class CreditNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(n: any) {
    return {
      id: n.id,
      credit_note_number: n.creditNoteNumber,
      sale: n.saleId,
      invoice: n.invoiceId,
      invoice_number: n.invoice?.invoiceNumber ?? null,
      reason: n.reason,
      total_refund: money(n.totalRefund),
      generated_by: n.generatedById,
      generated_by_name: n.generatedBy ? fullName(n.generatedBy) : null,
      issued_at: dt(n.issuedAt),
      status: n.status,
      items: (n.items ?? []).map((it: any) => ({
        id: it.id,
        sale_item: it.saleItemId,
        product: it.productId,
        product_name: it.product?.name ?? null,
        quantity_returned: it.quantityReturned,
        unit_price: money(it.unitPrice),
        subtotal: money(it.subtotal),
      })),
    };
  }

  private getFull(id: number) {
    return this.prisma.creditNote.findUnique({ where: { id }, include: INCLUDE });
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.creditNote,
      {
        searchFields: ['creditNoteNumber', 'sale.customer.fullName'],
        filterFields: [{ param: 'sale', field: 'saleId' }, 'status'],
        orderingFields: [
          { param: 'issued_at', field: 'issuedAt' },
          { param: 'total_refund', field: 'totalRefund' },
        ],
        defaultOrdering: [{ issuedAt: 'desc' }],
      },
      (n) => this.view(n),
      { include: INCLUDE },
    );
  }

  async retrieve(id: number) {
    const n = await this.getFull(id);
    if (!n) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(n);
  }

  async create(dto: CreateCreditNoteDto, actor: AuditActor) {
    const sale = await this.prisma.sale.findUnique({ where: { id: dto.sale } });
    if (!sale) throw new BadRequestException({ sale: ['La venta no existe.'] });
    if (sale.status === 'CANCELLED')
      throw new BadRequestException({
        sale: ['No se puede crear una nota crédito para una venta cancelada.'],
      });

    // Validar pertenencia y cantidades devolubles.
    const saleItemIds = dto.items.map((i) => i.sale_item);
    const saleItems = await this.prisma.saleItem.findMany({
      where: { id: { in: saleItemIds } },
      include: { product: true },
    });
    const byId = new Map(saleItems.map((si) => [si.id, si]));

    for (const it of dto.items) {
      const si = byId.get(it.sale_item);
      if (!si || si.saleId !== sale.id)
        throw new BadRequestException({
          items: [`El ítem #${it.sale_item} no pertenece a la venta #${sale.id}.`],
        });
      const agg = await this.prisma.creditNoteItem.aggregate({
        _sum: { quantityReturned: true },
        where: { saleItemId: si.id, creditNote: { status: 'ISSUED' } },
      });
      const alreadyReturned = agg._sum.quantityReturned ?? 0;
      const available = si.quantity - alreadyReturned;
      if (it.quantity_returned > available)
        throw new BadRequestException({
          items: [
            `No puede devolver ${it.quantity_returned} uds de "${si.product.name}". Disponible para devolución: ${available} uds (vendido: ${si.quantity}, ya devuelto: ${alreadyReturned}).`,
          ],
        });
    }

    const invoice = await this.prisma.customerInvoice.findUnique({
      where: { saleId: sale.id },
    });
    const customerLabel = sale.customerId
      ? (await this.prisma.customer.findUnique({ where: { id: sale.customerId } }))?.fullName ?? 'Cliente anónimo'
      : 'Cliente anónimo';

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await nextDailyNumber(
        tx,
        'invoicing_creditnote',
        'credit_note_number',
        `NC-${utcDateCompact()}`,
      );
      const note = await tx.creditNote.create({
        data: {
          creditNoteNumber: number,
          saleId: sale.id,
          invoiceId: invoice?.id ?? null,
          reason: dto.reason,
          totalRefund: new Prisma.Decimal(0),
          generatedById: actor.userId!,
          status: 'ISSUED',
        },
      });

      let totalRefund = new Prisma.Decimal(0);
      for (const it of dto.items) {
        const si = byId.get(it.sale_item)!;
        const subtotal = si.unitPrice.mul(it.quantity_returned);
        totalRefund = totalRefund.add(subtotal);
        await tx.creditNoteItem.create({
          data: {
            creditNoteId: note.id,
            saleItemId: si.id,
            productId: si.productId,
            quantityReturned: it.quantity_returned,
            unitPrice: si.unitPrice,
            subtotal,
          },
        });
        await tx.product.update({
          where: { id: si.productId },
          data: { stock: { increment: it.quantity_returned } },
        });
      }

      await tx.creditNote.update({
        where: { id: note.id },
        data: { totalRefund },
      });
      await tx.transaction.create({
        data: {
          type: 'EXPENSE',
          amount: totalRefund,
          concept: `Nota crédito ${number} — Venta #${sale.id} — ${customerLabel}`,
          referenceType: 'CREDIT_NOTE',
          referenceId: note.id,
          transactionDate: bogotaToday(),
          registeredById: actor.userId!,
        },
      });
      return note.id;
    });

    const note = await this.prisma.creditNote.findUnique({ where: { id } });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: note!.creditNoteNumber,
    });
    return this.retrieve(id);
  }

  async remove(id: number, actor: AuditActor) {
    const n = await this.prisma.creditNote.findUnique({ where: { id } });
    if (!n) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: n.creditNoteNumber,
    });
    await this.prisma.creditNote.delete({ where: { id } });
  }

  async buildPdf(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const n = await this.getFull(id);
    if (!n) throw new NotFoundException({ detail: 'No encontrado.' });
    const buffer = await buildCreditNotePdf({
      creditNoteNumber: n.creditNoteNumber,
      issuedAt: n.issuedAt,
      customerLabel: n.sale.customer ? n.sale.customer.fullName : 'Anónimo',
      saleId: n.saleId,
      invoiceNumber: n.invoice?.invoiceNumber ?? null,
      reason: n.reason,
      items: n.items.map((it: any) => ({
        name: it.product?.name ?? '',
        qty: it.quantityReturned,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal,
      })),
      totalRefund: n.totalRefund,
      generatedByName: fullName(n.generatedBy),
    });
    return { buffer, filename: `nota-credito-${n.creditNoteNumber}.pdf` };
  }
}
