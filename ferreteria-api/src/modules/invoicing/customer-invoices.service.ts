import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, CustomerInvoice } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { money, dt } from '../../common/serialization/format';
import { listPaginated } from '../../common/crud/list.helper';
import { utcDateCompact } from '../../common/utils/dates';
import { nextDailyNumber } from '../../common/utils/numbering';
import { buildInvoicePdf } from './pdf/invoice-pdf';
import {
  CreateCustomerInvoiceDto,
  UpdateCustomerInvoiceDto,
} from './dto/customer-invoice.dto';

const APP = 'invoicing';
const MODEL = 'customerinvoice';
const MAX_DISCOUNT_PCT = new Prisma.Decimal(30);
const STATUS_LABEL: Record<string, string> = {
  ISSUED: 'Emitida',
  CANCELLED: 'Anulada',
};

function fullName(u: { firstName: string; lastName: string; username: string }) {
  return `${u.firstName} ${u.lastName}`.trim() || u.username;
}

@Injectable()
export class CustomerInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(inv: CustomerInvoice) {
    return {
      id: inv.id,
      invoice_number: inv.invoiceNumber,
      sale: inv.saleId,
      customer: inv.customerId,
      generated_by: inv.generatedById,
      total: money(inv.total),
      tax: money(inv.tax),
      discount: money(inv.discount),
      notes: inv.notes,
      issued_at: dt(inv.issuedAt),
      sent_by_email: inv.sentByEmail,
      email_sent_to: inv.emailSentTo,
      status: inv.status,
    };
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.customerInvoice,
      {
        searchFields: ['invoiceNumber', 'customer.fullName'],
        orderingFields: [
          { param: 'issued_at', field: 'issuedAt' },
          'total',
        ],
        defaultOrdering: [{ issuedAt: 'desc' }],
      },
      (inv) => this.view(inv),
    );
  }

  async retrieve(id: number) {
    const inv = await this.prisma.customerInvoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(inv);
  }

  private maxDiscount(saleTotal: Prisma.Decimal): Prisma.Decimal {
    return saleTotal.mul(MAX_DISCOUNT_PCT).div(100).toDecimalPlaces(2);
  }

  async create(dto: CreateCustomerInvoiceDto, actor: AuditActor) {
    const sale = await this.prisma.sale.findUnique({ where: { id: dto.sale } });
    if (!sale)
      throw new BadRequestException({ sale: ['La venta no existe.'] });

    const dup = await this.prisma.customerInvoice.findUnique({
      where: { saleId: dto.sale },
    });
    if (dup)
      throw new BadRequestException({
        sale: ['Esta venta ya tiene una factura generada.'],
      });
    if (sale.status === 'CANCELLED')
      throw new BadRequestException({
        sale: ['No se puede generar una factura para una venta cancelada.'],
      });

    const discount = new Prisma.Decimal(dto.discount ?? '0');
    const tax = new Prisma.Decimal(dto.tax ?? '0');
    this.assertDiscount(sale.total, discount);

    const total = sale.total.sub(discount).add(tax);
    const customerId = dto.customer ?? sale.customerId;

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await nextDailyNumber(
        tx,
        'invoicing_customerinvoice',
        'invoice_number',
        `FV-${utcDateCompact()}`,
      );
      const inv = await tx.customerInvoice.create({
        data: {
          invoiceNumber: number,
          saleId: dto.sale,
          customerId,
          generatedById: actor.userId!,
          total,
          tax,
          discount,
          notes: dto.notes ?? '',
          status: dto.status ?? 'ISSUED',
        },
      });
      return inv.id;
    });

    const inv = await this.prisma.customerInvoice.findUnique({ where: { id } });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: inv!.invoiceNumber,
    });
    return this.view(inv!);
  }

  private assertDiscount(saleTotal: Prisma.Decimal, discount: Prisma.Decimal) {
    if (discount.lt(0))
      throw new BadRequestException({
        discount: ['El descuento no puede ser negativo.'],
      });
    if (discount.gt(0)) {
      const max = this.maxDiscount(saleTotal);
      if (discount.gt(max))
        throw new BadRequestException({
          discount: [
            `El descuento ${discount.toFixed(2)} supera el margen máximo permitido del 30% (${max.toFixed(2)}).`,
          ],
        });
    }
  }

  async update(id: number, dto: UpdateCustomerInvoiceDto, actor: AuditActor) {
    const before = await this.prisma.customerInvoice.findUnique({
      where: { id },
      include: { sale: true },
    });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });

    if (!dto.force_update) {
      const activeCN = await this.prisma.creditNote.count({
        where: { invoiceId: id, status: 'ISSUED' },
      });
      if (activeCN > 0)
        throw new BadRequestException({
          credit_notes_warning: [
            'Esta factura tiene notas crédito activas asociadas. La modificación puede afectar la consistencia contable. Reenvíe la solicitud con force_update=true para confirmar.',
          ],
        });
    }

    const discount =
      dto.discount !== undefined
        ? new Prisma.Decimal(dto.discount)
        : before.discount;
    const tax =
      dto.tax !== undefined ? new Prisma.Decimal(dto.tax) : before.tax;
    this.assertDiscount(before.sale.total, discount);
    const total = before.sale.total.sub(discount).add(tax);

    const data: Prisma.CustomerInvoiceUpdateInput = { total, discount, tax };
    if (dto.customer !== undefined)
      data.customer =
        dto.customer === null
          ? { disconnect: true }
          : { connect: { id: dto.customer } };
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.status !== undefined) data.status = dto.status;
    if (before.sentByEmail) data.sentByEmail = false;

    const after = await this.prisma.customerInvoice.update({
      where: { id },
      data,
    });
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: after.invoiceNumber,
      changedFields: this.audit.diff(before, after, [
        'total',
        'tax',
        'discount',
        'notes',
        'status',
        'customerId',
        'sentByEmail',
      ]),
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const inv = await this.prisma.customerInvoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: inv.invoiceNumber,
    });
    await this.prisma.customerInvoice.delete({ where: { id } });
  }

  async sendEmail(id: number, recipient: string | undefined) {
    const inv = await this.prisma.customerInvoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException({ detail: 'No encontrado.' });
    if (inv.sentByEmail)
      throw new BadRequestException({
        detail: 'La factura ya fue enviada por correo.',
      });
    const email = (recipient ?? '').trim();
    if (!email)
      throw new BadRequestException({
        detail: 'Se requiere el campo recipient_email.',
      });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new BadRequestException({
        detail: 'El correo electrónico no tiene un formato válido.',
      });

    const after = await this.prisma.customerInvoice.update({
      where: { id },
      data: { sentByEmail: true, emailSentTo: email },
    });
    // TODO: integrar API de envio de correo (SendGrid/SES/Resend).
    return this.view(after);
  }

  async buildPdf(
    id: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const inv = await this.prisma.customerInvoice.findUnique({
      where: { id },
      include: {
        customer: true,
        generatedBy: true,
        sale: { include: { items: { include: { product: true } } } },
      },
    });
    if (!inv) throw new NotFoundException({ detail: 'No encontrado.' });

    const buffer = await buildInvoicePdf({
      invoiceNumber: inv.invoiceNumber,
      issuedAt: inv.issuedAt,
      customerLabel: inv.customer ? inv.customer.fullName : 'Anonimo',
      statusLabel: STATUS_LABEL[inv.status] ?? inv.status,
      items: inv.sale.items.map((it) => ({
        name: it.product?.name ?? '',
        qty: it.quantity,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal,
      })),
      grossTotal: inv.sale.total,
      discount: inv.discount,
      tax: inv.tax,
      total: inv.total,
      notes: inv.notes,
      generatedByName: fullName(inv.generatedBy),
    });
    return { buffer, filename: `factura-${inv.invoiceNumber}.pdf` };
  }
}
