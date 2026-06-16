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
import {
  parsePageParams,
  buildPaginated,
} from '../../common/pagination/pagination';
import {
  bogotaToday,
  bogotaDayStart,
  bogotaDayEnd,
} from '../../common/utils/dates';
import { CreateSaleDto, UpdateSaleDto, SaleItemInput } from './dto/sale.dto';

const APP = 'sales';
const MODEL = 'sale';

const SALE_INCLUDE = {
  items: { include: { product: true }, orderBy: { id: 'asc' } },
  customer: true,
  paymentMethod: true,
  invoice: true,
} as const;

type TxClient = Prisma.TransactionClient;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Serializacion (SaleSerializer)
  // -------------------------------------------------------------------------
  private view(s: any) {
    const isAnon = s.isAnonymous || !s.customer;
    return {
      id: s.id,
      customer: s.customerId,
      customer_name: isAnon ? 'Anónimo' : s.customer.fullName,
      customer_email: s.customer ? s.customer.email : '',
      payment_method: s.paymentMethodId,
      payment_method_name: s.paymentMethod?.name ?? null,
      employee: s.employeeId,
      total: money(s.total),
      status: s.status,
      is_anonymous: s.isAnonymous,
      sale_date: dt(s.saleDate),
      items: (s.items ?? []).map((it: any) => ({
        id: it.id,
        product: it.productId,
        product_name: it.product?.name ?? null,
        quantity: it.quantity,
        unit_price: money(it.unitPrice),
        subtotal: money(it.subtotal),
      })),
      invoice_id: s.invoice?.id ?? null,
      sent_by_email: s.invoice?.sentByEmail ?? false,
      email_sent_to: s.invoice?.emailSentTo ?? '',
      created_at: dt(s.createdAt),
      updated_at: dt(s.updatedAt),
    };
  }

  private async getFull(id: number) {
    return this.prisma.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
  }

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------
  private buildWhere(req: Request): Prisma.SaleWhereInput {
    const and: Prisma.SaleWhereInput[] = [];
    const q = req.query;

    if (q.status !== undefined) and.push({ status: String(q.status) as any });
    if (q.payment_method !== undefined)
      and.push({ paymentMethodId: Number(q.payment_method) });
    if (q.sale_id !== undefined) and.push({ id: Number(q.sale_id) });

    const saleDate: Prisma.DateTimeFilter = {};
    if (q.date_from !== undefined)
      saleDate.gte = bogotaDayStart(String(q.date_from));
    if (q.date_to !== undefined)
      saleDate.lte = bogotaDayEnd(String(q.date_to));
    if (saleDate.gte || saleDate.lte) and.push({ saleDate });

    const search = Array.isArray(q.search) ? q.search[0] : q.search;
    if (search) {
      const text = String(search);
      const or: Prisma.SaleWhereInput[] = [
        { customer: { fullName: { contains: text, mode: 'insensitive' } } },
      ];
      if (/^\d+$/.test(text)) or.push({ id: Number(text) });
      and.push({ OR: or });
    }
    return and.length > 0 ? { AND: and } : {};
  }

  private buildOrder(req: Request): Prisma.SaleOrderByWithRelationInput[] {
    const map: Record<string, string> = {
      sale_date: 'saleDate',
      total: 'total',
      id: 'id',
    };
    const raw = Array.isArray(req.query.ordering)
      ? req.query.ordering[0]
      : req.query.ordering;
    if (raw) {
      const out: Prisma.SaleOrderByWithRelationInput[] = [];
      for (const token of String(raw).split(',')) {
        const desc = token.startsWith('-');
        const key = desc ? token.slice(1) : token;
        if (map[key]) out.push({ [map[key]]: desc ? 'desc' : 'asc' } as any);
      }
      if (out.length > 0) return out;
    }
    return [{ saleDate: 'desc' }];
  }

  async list(req: Request) {
    const page = parsePageParams(req);
    const where = this.buildWhere(req);
    const [count, rows] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        orderBy: this.buildOrder(req),
        skip: page.skip,
        take: page.take,
        include: SALE_INCLUDE,
      }),
    ]);
    return buildPaginated(req, count, rows.map((s) => this.view(s)), page);
  }

  async retrieve(id: number) {
    const s = await this.getFull(id);
    if (!s) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(s);
  }

  // -------------------------------------------------------------------------
  // Helpers de stock / bloqueo
  // -------------------------------------------------------------------------
  private async lockProducts(tx: TxClient, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    // SELECT ... FOR UPDATE — equivalente a Product.objects.select_for_update().
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM products_product WHERE id IN (${Prisma.join(
        ids,
      )}) FOR UPDATE`,
    );
  }

  /** Suma cantidades por producto (un producto puede repetirse en lineas). */
  private sumByProduct(items: SaleItemInput[]): Map<number, number> {
    const m = new Map<number, number>();
    for (const it of items) m.set(it.product, (m.get(it.product) ?? 0) + it.quantity);
    return m;
  }

  // -------------------------------------------------------------------------
  // create — paridad SaleCreateSerializer
  // -------------------------------------------------------------------------
  async create(dto: CreateSaleDto, actor: AuditActor) {
    const productIds = [...new Set(dto.items.map((i) => i.product))];

    const saleId = await this.prisma.$transaction(async (tx) => {
      await this.lockProducts(tx, productIds);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      // Validacion de existencia + stock (agregado por producto).
      const wanted = this.sumByProduct(dto.items);
      for (const [pid, qty] of wanted) {
        const p = byId.get(pid);
        if (!p)
          throw new BadRequestException({ items: [`El producto ${pid} no existe.`] });
        if (p.stock < qty)
          throw new BadRequestException({
            items: [
              `Stock insuficiente para "${p.name}". Disponible: ${p.stock}, solicitado: ${qty}.`,
            ],
          });
      }

      // Total a partir de sale_price.
      let total = new Prisma.Decimal(0);
      for (const it of dto.items) {
        total = total.add(byId.get(it.product)!.salePrice.mul(it.quantity));
      }

      const customer = dto.customer
        ? await tx.customer.findUnique({ where: { id: dto.customer } })
        : null;

      const sale = await tx.sale.create({
        data: {
          customerId: dto.customer ?? null,
          paymentMethodId: dto.payment_method,
          employeeId: actor.userId!,
          isAnonymous: dto.is_anonymous ?? false,
          total,
          status: 'COMPLETED',
        },
      });

      for (const it of dto.items) {
        const p = byId.get(it.product)!;
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: p.id,
            quantity: it.quantity,
            unitPrice: p.salePrice,
            subtotal: p.salePrice.mul(it.quantity),
          },
        });
      }
      for (const [pid, qty] of wanted) {
        await tx.product.update({
          where: { id: pid },
          data: { stock: { decrement: qty } },
        });
      }

      // Signal sync_transaction_with_sale -> INCOME.
      const label = customer ? customer.fullName : 'Cliente anónimo';
      await tx.transaction.create({
        data: {
          type: 'INCOME',
          amount: total,
          concept: `Venta #${sale.id} — ${label}`,
          referenceType: 'SALE',
          referenceId: sale.id,
          transactionDate: bogotaToday(),
          registeredById: actor.userId!,
        },
      });

      return sale.id;
    });

    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: saleId,
      objectRepr: `Venta #${saleId}`,
    });
    return this.retrieve(saleId);
  }

  // -------------------------------------------------------------------------
  // update — paridad SaleEditSerializer
  // -------------------------------------------------------------------------
  async update(id: number, dto: UpdateSaleDto, actor: AuditActor) {
    const before = await this.getFull(id);
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    if (before.status === 'CANCELLED')
      throw new BadRequestException({
        detail: 'No se puede editar una venta cancelada.',
      });

    const oldItemsSnapshot = before.items.map((it: any) => ({
      product_id: it.productId,
      product_name: it.product?.name ?? String(it.productId),
      quantity: it.quantity,
      unit_price: String(it.unitPrice),
    }));
    const oldTotal = before.total;

    const newProductIds = [...new Set(dto.items.map((i) => i.product))];
    const oldProductIds = before.items.map((it: any) => it.productId);
    const unionIds = [...new Set([...oldProductIds, ...newProductIds])];

    const newTotal = await this.prisma.$transaction(async (tx) => {
      await this.lockProducts(tx, unionIds);

      // 1) Restaurar stock de los items existentes.
      const restore = this.sumByProduct(
        before.items.map((it: any) => ({
          product: it.productId,
          quantity: it.quantity,
        })),
      );
      for (const [pid, qty] of restore) {
        await tx.product.update({
          where: { id: pid },
          data: { stock: { increment: qty } },
        });
      }

      // 2) Borrar items anteriores.
      await tx.saleItem.deleteMany({ where: { saleId: id } });

      // 3) Leer productos nuevos (stock ya restaurado), validar y crear.
      const products = await tx.product.findMany({
        where: { id: { in: newProductIds } },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      const wanted = this.sumByProduct(dto.items);
      for (const [pid, qty] of wanted) {
        const p = byId.get(pid);
        if (!p)
          throw new BadRequestException({ items: [`El producto ${pid} no existe.`] });
        if (p.stock < qty)
          throw new BadRequestException({
            items: [
              `Stock insuficiente para "${p.name}". Disponible: ${p.stock}, solicitado: ${qty}.`,
            ],
          });
      }

      let total = new Prisma.Decimal(0);
      for (const it of dto.items) {
        const p = byId.get(it.product)!;
        total = total.add(p.salePrice.mul(it.quantity));
        await tx.saleItem.create({
          data: {
            saleId: id,
            productId: p.id,
            quantity: it.quantity,
            unitPrice: p.salePrice,
            subtotal: p.salePrice.mul(it.quantity),
          },
        });
      }
      for (const [pid, qty] of wanted) {
        await tx.product.update({
          where: { id: pid },
          data: { stock: { decrement: qty } },
        });
      }

      // 4) Aplicar cambios de cabecera + nuevo total.
      const data: Prisma.SaleUpdateInput = { total };
      if (dto.customer !== undefined)
        data.customer =
          dto.customer === null
            ? { disconnect: true }
            : { connect: { id: dto.customer } };
      if (dto.payment_method !== undefined)
        data.paymentMethod = { connect: { id: dto.payment_method } };
      if (dto.is_anonymous !== undefined) data.isAnonymous = dto.is_anonymous;
      await tx.sale.update({ where: { id }, data });

      // 5) Sincronizar el monto de la Transaction INCOME.
      await tx.transaction.updateMany({
        where: { referenceType: 'SALE', referenceId: id, type: 'INCOME' },
        data: { amount: total },
      });

      return total;
    });

    // Auditoria: cambios a nivel de items/total + cabecera.
    const after = await this.getFull(id);
    const newItemsSnapshot = after!.items.map((it: any) => ({
      product_id: it.productId,
      product_name: it.product?.name ?? String(it.productId),
      quantity: it.quantity,
      unit_price: String(it.unitPrice),
    }));
    const changed: Record<string, { old: unknown; new: unknown }> = {
      items: { old: oldItemsSnapshot, new: newItemsSnapshot },
    };
    if (!oldTotal.equals(newTotal))
      changed.total = { old: String(oldTotal), new: String(newTotal) };
    const headerDiff = this.audit.diff(before, after as any, [
      'customerId',
      'paymentMethodId',
      'isAnonymous',
    ]);
    Object.assign(changed, headerDiff);

    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Venta #${id}`,
      changedFields: changed,
    });

    const result: any = this.view(after);
    result.invoice_warning = after!.invoice
      ? `Esta venta tiene una factura generada (#${after!.invoice.id}). Revise y actualice la factura si es necesario.`
      : null;
    return result;
  }

  // -------------------------------------------------------------------------
  // cancel — paridad SaleViewSet.cancel + signals
  // -------------------------------------------------------------------------
  async cancel(id: number) {
    const sale = await this.getFull(id);
    if (!sale) throw new NotFoundException({ detail: 'No encontrado.' });
    if (sale.status === 'CANCELLED')
      throw new BadRequestException({ detail: 'La venta ya esta cancelada.' });

    const productIds = sale.items.map((it: any) => it.productId);
    await this.prisma.$transaction(async (tx) => {
      await this.lockProducts(tx, [...new Set(productIds)]);

      // Restaurar stock (restore_stock_on_cancellation).
      const restore = this.sumByProduct(
        sale.items.map((it: any) => ({
          product: it.productId,
          quantity: it.quantity,
        })),
      );
      for (const [pid, qty] of restore) {
        await tx.product.update({
          where: { id: pid },
          data: { stock: { increment: qty } },
        });
      }

      await tx.sale.update({ where: { id }, data: { status: 'CANCELLED' } });

      // Reversa EXPENSE (sync_transaction_with_sale).
      const label = sale.customer ? sale.customer.fullName : 'Cliente anónimo';
      await tx.transaction.create({
        data: {
          type: 'EXPENSE',
          amount: sale.total,
          concept: `Anulación Venta #${id} — ${label}`,
          referenceType: 'SALE',
          referenceId: id,
          transactionDate: bogotaToday(),
          registeredById: sale.employeeId,
        },
      });
    });

    return this.retrieve(id);
  }

  // -------------------------------------------------------------------------
  // destroy — paridad AuditLogMixin.perform_destroy (no restaura stock)
  // -------------------------------------------------------------------------
  async remove(id: number, actor: AuditActor) {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Venta #${id}`,
    });
    await this.prisma.sale.delete({ where: { id } }); // items CASCADE
  }
}
