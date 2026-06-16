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
import { lockProductsForUpdate, sumByProduct } from '../../common/inventory/stock';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';

const APP = 'suppliers';
const MODEL = 'purchaseorder';

const INCLUDE = {
  items: { include: { product: true }, orderBy: { id: 'asc' } },
  supplier: true,
} as const;

type TxClient = Prisma.TransactionClient;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(o: any) {
    return {
      id: o.id,
      supplier: o.supplierId,
      supplier_name: o.supplier?.businessName ?? null,
      status: o.status,
      notes: o.notes,
      items: (o.items ?? []).map((it: any) => ({
        id: it.id,
        product: it.productId,
        product_name: it.product?.name ?? null,
        quantity: it.quantity,
        unit_cost: money(it.unitCost),
      })),
      created_by: o.createdById,
      created_at: dt(o.createdAt),
      updated_at: dt(o.updatedAt),
    };
  }

  private getFull(id: number) {
    return this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: INCLUDE,
    });
  }

  async list(req: Request) {
    const page = parsePageParams(req);
    const order = this.buildOrder(req);
    const [count, rows] = await Promise.all([
      this.prisma.purchaseOrder.count({}),
      this.prisma.purchaseOrder.findMany({
        orderBy: order,
        skip: page.skip,
        take: page.take,
        include: INCLUDE,
      }),
    ]);
    return buildPaginated(req, count, rows.map((o) => this.view(o)), page);
  }

  private buildOrder(req: Request): Prisma.PurchaseOrderOrderByWithRelationInput[] {
    const raw = Array.isArray(req.query.ordering)
      ? req.query.ordering[0]
      : req.query.ordering;
    if (raw) {
      const out: Prisma.PurchaseOrderOrderByWithRelationInput[] = [];
      for (const token of String(raw).split(',')) {
        const desc = token.startsWith('-');
        const key = desc ? token.slice(1) : token;
        if (key === 'created_at')
          out.push({ createdAt: desc ? 'desc' : 'asc' });
      }
      if (out.length > 0) return out;
    }
    return [{ createdAt: 'desc' }];
  }

  async retrieve(id: number) {
    const o = await this.getFull(id);
    if (!o) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(o);
  }

  async create(dto: CreatePurchaseOrderDto, actor: AuditActor) {
    for (const it of dto.items) {
      if (new Prisma.Decimal(it.unit_cost).lte(0))
        throw new BadRequestException({ items: ['unit_cost debe ser mayor a 0.'] });
    }
    const id = await this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({
        data: {
          supplierId: dto.supplier,
          notes: dto.notes ?? '',
          createdById: actor.userId!,
          status: 'DRAFT',
        },
      });
      for (const it of dto.items) {
        await tx.purchaseOrderItem.create({
          data: {
            orderId: order.id,
            productId: it.product,
            quantity: it.quantity,
            unitCost: new Prisma.Decimal(it.unit_cost),
          },
        });
      }
      return order.id;
    });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Orden de compra #${id}`,
    });
    return this.retrieve(id);
  }

  /** increment_stock_on_received: suma stock de todos los items de la orden. */
  private async receiveStock(tx: TxClient, orderId: number): Promise<void> {
    const items = await tx.purchaseOrderItem.findMany({
      where: { orderId },
      select: { productId: true, quantity: true },
    });
    const wanted = sumByProduct(
      items.map((it) => ({ product: it.productId, quantity: it.quantity })),
    );
    await lockProductsForUpdate(tx, [...wanted.keys()]);
    for (const [pid, qty] of wanted) {
      await tx.product.update({
        where: { id: pid },
        data: { stock: { increment: qty } },
      });
    }
  }

  async update(id: number, dto: UpdatePurchaseOrderDto, actor: AuditActor) {
    const before = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });

    const data: Prisma.PurchaseOrderUpdateInput = {};
    if (dto.supplier !== undefined)
      data.supplier = { connect: { id: dto.supplier } };
    if (dto.notes !== undefined) data.notes = dto.notes;
    let transitionToReceived = false;
    if (dto.status !== undefined && dto.status !== before.status) {
      data.status = dto.status;
      if (before.status !== 'RECEIVED' && dto.status === 'RECEIVED')
        transitionToReceived = true;
    }

    const after = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({ where: { id }, data });
      if (transitionToReceived) await this.receiveStock(tx, id);
      return updated;
    });

    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Orden de compra #${id}`,
      changedFields: this.audit.diff(before, after, [
        'supplierId',
        'status',
        'notes',
      ]),
    });
    return this.retrieve(id);
  }

  /** POST /purchase-orders/{id}/receive/ — transicion a RECEIVED + stock. */
  async receive(id: number) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException({ detail: 'No encontrado.' });
    if (order.status === 'RECEIVED')
      throw new BadRequestException({ detail: 'La orden ya fue recibida.' });
    if (order.status === 'CANCELLED')
      throw new BadRequestException({
        detail: 'No se puede recibir una orden cancelada.',
      });

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'RECEIVED' },
      });
      await this.receiveStock(tx, id);
    });
    return this.retrieve(id);
  }

  async remove(id: number, actor: AuditActor) {
    const o = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Orden de compra #${id}`,
    });
    await this.prisma.purchaseOrder.delete({ where: { id } });
  }
}
