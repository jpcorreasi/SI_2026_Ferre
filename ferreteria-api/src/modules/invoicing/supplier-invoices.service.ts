import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { money, dt, dateOnly } from '../../common/serialization/format';
import { listPaginated } from '../../common/crud/list.helper';
import { parseDateOnly } from '../../common/utils/dates';
import {
  CreateSupplierInvoiceDto,
  UpdateSupplierInvoiceDto,
} from './dto/supplier-invoice.dto';

const APP = 'invoicing';
const MODEL = 'supplierinvoice';

const INCLUDE = {
  items: { include: { product: true }, orderBy: { id: 'asc' } },
  supplier: true,
  registeredBy: true,
} as const;

function fullName(u: { firstName: string; lastName: string; username: string }) {
  return `${u.firstName} ${u.lastName}`.trim() || u.username;
}

@Injectable()
export class SupplierInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(inv: any) {
    return {
      id: inv.id,
      supplier_invoice_number: inv.supplierInvoiceNumber,
      supplier: inv.supplierId,
      supplier_name: inv.supplier?.businessName ?? null,
      purchase_order: inv.purchaseOrderId,
      registered_by: inv.registeredById,
      registered_by_name: inv.registeredBy ? fullName(inv.registeredBy) : null,
      payment_status: inv.paymentStatus,
      tax: money(inv.tax),
      total: money(inv.total),
      received_at: dateOnly(inv.receivedAt),
      items: (inv.items ?? []).map((it: any) => ({
        id: it.id,
        product: it.productId,
        product_name: it.product?.name ?? null,
        quantity: it.quantity,
        unit_cost: money(it.unitCost),
        subtotal: money(it.subtotal),
      })),
      created_at: dt(inv.createdAt),
      updated_at: dt(inv.updatedAt),
    };
  }

  private getFull(id: number) {
    return this.prisma.supplierInvoice.findUnique({
      where: { id },
      include: INCLUDE,
    });
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.supplierInvoice,
      {
        searchFields: ['supplierInvoiceNumber', 'supplier.businessName'],
        filterFields: [
          { param: 'payment_status', field: 'paymentStatus' },
          { param: 'supplier', field: 'supplierId' },
        ],
        orderingFields: [
          { param: 'received_at', field: 'receivedAt' },
          'total',
          { param: 'payment_status', field: 'paymentStatus' },
        ],
        defaultOrdering: [{ receivedAt: 'desc' }],
      },
      (inv) => this.view(inv),
      { include: INCLUDE },
    );
  }

  async retrieve(id: number) {
    const inv = await this.getFull(id);
    if (!inv) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(inv);
  }

  private async assertUniqueNumber(
    supplierId: number,
    number: string,
    excludeId?: number,
  ) {
    const existing = await this.prisma.supplierInvoice.findFirst({
      where: {
        supplierId,
        supplierInvoiceNumber: number,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      include: { supplier: true },
    });
    if (existing)
      throw new BadRequestException({
        supplier_invoice_number: [
          `Ya existe una factura con el número "${number}" para el proveedor "${existing.supplier.businessName}".`,
        ],
      });
  }

  async create(dto: CreateSupplierInvoiceDto, actor: AuditActor) {
    const number = dto.supplier_invoice_number.trim();
    await this.assertUniqueNumber(dto.supplier, number);

    const tax = new Prisma.Decimal(dto.tax ?? '0');
    let subtotalSum = new Prisma.Decimal(0);
    for (const it of dto.items) {
      subtotalSum = subtotalSum.add(new Prisma.Decimal(it.unit_cost).mul(it.quantity));
    }
    const total = subtotalSum.add(tax);

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplier },
    });
    if (!supplier)
      throw new BadRequestException({ supplier: ['El proveedor no existe.'] });

    const id = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.supplierInvoice.create({
        data: {
          supplierInvoiceNumber: number,
          supplierId: dto.supplier,
          purchaseOrderId: dto.purchase_order ?? null,
          registeredById: actor.userId!,
          paymentStatus: dto.payment_status ?? 'PENDING',
          tax,
          total,
          receivedAt: parseDateOnly(dto.received_at),
        },
      });
      for (const it of dto.items) {
        const sub = new Prisma.Decimal(it.unit_cost).mul(it.quantity);
        await tx.supplierInvoiceItem.create({
          data: {
            invoiceId: inv.id,
            productId: it.product,
            quantity: it.quantity,
            unitCost: new Prisma.Decimal(it.unit_cost),
            subtotal: sub,
          },
        });
        await tx.product.update({
          where: { id: it.product },
          data: { stock: { increment: it.quantity } },
        });
      }
      await tx.transaction.create({
        data: {
          type: 'EXPENSE',
          amount: total,
          concept: `Factura proveedor ${number} — ${supplier.businessName}`,
          referenceType: 'SUPPLIER_INVOICE',
          referenceId: inv.id,
          transactionDate: parseDateOnly(dto.received_at),
          registeredById: actor.userId!,
        },
      });
      return inv.id;
    });

    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `${number} — ${supplier.businessName}`,
    });
    return this.retrieve(id);
  }

  async update(id: number, dto: UpdateSupplierInvoiceDto, actor: AuditActor) {
    const before = await this.prisma.supplierInvoice.findUnique({
      where: { id },
      include: { items: true, supplier: true },
    });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });

    const supplierId = dto.supplier ?? before.supplierId;
    const number = dto.supplier_invoice_number ?? before.supplierInvoiceNumber;
    if (dto.supplier_invoice_number !== undefined || dto.supplier !== undefined)
      await this.assertUniqueNumber(supplierId, number, id);

    // Aviso: factura registrada en un periodo de caja cerrado (bypass force_update).
    if (!dto.force_update) {
      const txn = await this.prisma.transaction.findFirst({
        where: { referenceType: 'SUPPLIER_INVOICE', referenceId: id },
      });
      if (txn) {
        const closed = await this.prisma.cashRegister.count({
          where: {
            status: 'CLOSED',
            openedAt: { lte: txn.createdAt },
            closedAt: { gte: txn.createdAt },
          },
        });
        if (closed > 0)
          throw new BadRequestException({
            closed_register_warning: [
              'Esta factura fue registrada durante un período de caja ya cerrado. Modificarla puede afectar la conciliación contable. Reenvíe con force_update=true para confirmar.',
            ],
          });
      }
    }

    // Bloqueo duro: el reemplazo de items no puede dejar stock negativo.
    let net: Map<number, number> | null = null;
    if (dto.items !== undefined) {
      net = new Map<number, number>();
      for (const old of before.items)
        net.set(old.productId, (net.get(old.productId) ?? 0) - old.quantity);
      for (const it of dto.items)
        net.set(it.product, (net.get(it.product) ?? 0) + it.quantity);

      for (const [pid, delta] of net) {
        const prod = await this.prisma.product.findUnique({ where: { id: pid } });
        if (prod && prod.stock + delta < 0)
          throw new BadRequestException({
            stock_warning: [
              `La modificación dejaría "${prod.name}" con stock negativo (${prod.stock + delta} uds). Corrija las cantidades antes de guardar.`,
            ],
          });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.SupplierInvoiceUpdateInput = {};
      if (dto.supplier_invoice_number !== undefined)
        data.supplierInvoiceNumber = number;
      if (dto.supplier !== undefined)
        data.supplier = { connect: { id: dto.supplier } };
      if (dto.purchase_order !== undefined)
        data.purchaseOrder =
          dto.purchase_order === null
            ? { disconnect: true }
            : { connect: { id: dto.purchase_order } };
      if (dto.received_at !== undefined)
        data.receivedAt = parseDateOnly(dto.received_at);
      if (dto.payment_status !== undefined)
        data.paymentStatus = dto.payment_status;
      if (dto.tax !== undefined) data.tax = new Prisma.Decimal(dto.tax);

      if (net) {
        for (const [pid, delta] of net) {
          if (delta !== 0)
            await tx.product.update({
              where: { id: pid },
              data: { stock: { increment: delta } },
            });
        }
        await tx.supplierInvoiceItem.deleteMany({ where: { invoiceId: id } });
        let subtotalSum = new Prisma.Decimal(0);
        for (const it of dto.items!) {
          const sub = new Prisma.Decimal(it.unit_cost).mul(it.quantity);
          subtotalSum = subtotalSum.add(sub);
          await tx.supplierInvoiceItem.create({
            data: {
              invoiceId: id,
              productId: it.product,
              quantity: it.quantity,
              unitCost: new Prisma.Decimal(it.unit_cost),
              subtotal: sub,
            },
          });
        }
        const tax = dto.tax !== undefined ? new Prisma.Decimal(dto.tax) : before.tax;
        data.total = subtotalSum.add(tax);
      } else if (dto.tax !== undefined) {
        const existing = before.items.reduce(
          (acc, it) => acc.add(it.subtotal),
          new Prisma.Decimal(0),
        );
        data.total = existing.add(new Prisma.Decimal(dto.tax));
      }

      const updated = await tx.supplierInvoice.update({ where: { id }, data });

      // Sincronizar la Transaction EXPENSE asociada.
      const supplier = await tx.supplier.findUnique({
        where: { id: updated.supplierId },
      });
      await tx.transaction.updateMany({
        where: { referenceType: 'SUPPLIER_INVOICE', referenceId: id },
        data: {
          amount: updated.total,
          concept: `Factura proveedor ${updated.supplierInvoiceNumber} — ${supplier?.businessName ?? ''}`,
          transactionDate: updated.receivedAt,
        },
      });
    });

    const after = await this.getFull(id);
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `${after!.supplierInvoiceNumber} — ${after!.supplier?.businessName ?? ''}`,
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const inv = await this.getFull(id);
    if (!inv) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `${inv.supplierInvoiceNumber} — ${inv.supplier?.businessName ?? ''}`,
    });
    await this.prisma.supplierInvoice.delete({ where: { id } });
  }
}
