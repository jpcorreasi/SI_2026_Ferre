import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { dt } from '../../common/serialization/format';
import { listPaginated } from '../../common/crud/list.helper';
import {
  CreateOrderRequestDto,
  UpdateOrderRequestDto,
} from './dto/order-request.dto';

const APP = 'suppliers';
const MODEL = 'orderrequest';

const INCLUDE = {
  items: { include: { product: true }, orderBy: { id: 'asc' } },
  supplier: true,
  createdBy: true,
} as const;

@Injectable()
export class OrderRequestsService {
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
        product_code: it.product?.code ?? null,
        current_stock: it.product?.stock ?? null,
        quantity_requested: it.quantityRequested,
        notes: it.notes,
      })),
      created_by: o.createdById,
      created_by_name: o.createdBy?.username ?? null,
      created_at: dt(o.createdAt),
      updated_at: dt(o.updatedAt),
    };
  }

  private getFull(id: number) {
    return this.prisma.orderRequest.findUnique({
      where: { id },
      include: INCLUDE,
    });
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.orderRequest,
      {
        filterFields: [{ param: 'supplier', field: 'supplierId' }, 'status'],
        orderingFields: [{ param: 'created_at', field: 'createdAt' }, 'status'],
        defaultOrdering: [{ createdAt: 'desc' }],
      },
      (o) => this.view(o),
      { include: INCLUDE },
    );
  }

  async retrieve(id: number) {
    const o = await this.getFull(id);
    if (!o) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(o);
  }

  async create(dto: CreateOrderRequestDto, actor: AuditActor) {
    const id = await this.prisma.$transaction(async (tx) => {
      const reqObj = await tx.orderRequest.create({
        data: {
          supplierId: dto.supplier,
          notes: dto.notes ?? '',
          createdById: actor.userId!,
          status: 'PENDING',
        },
      });
      for (const it of dto.items) {
        await tx.orderRequestItem.create({
          data: {
            orderRequestId: reqObj.id,
            productId: it.product,
            quantityRequested: it.quantity_requested,
            notes: it.notes ?? '',
          },
        });
      }
      return reqObj.id;
    });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Solicitud de pedido #${id}`,
    });
    return this.retrieve(id);
  }

  async update(id: number, dto: UpdateOrderRequestDto, actor: AuditActor) {
    const before = await this.prisma.orderRequest.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    const data: Record<string, any> = {};
    if (dto.supplier !== undefined) data.supplierId = dto.supplier;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;
    const after = await this.prisma.orderRequest.update({ where: { id }, data });
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Solicitud de pedido #${id}`,
      changedFields: this.audit.diff(before, after, [
        'supplierId',
        'status',
        'notes',
      ]),
    });
    return this.retrieve(id);
  }

  /** POST /order-requests/{id}/mark-reviewed/ — PENDING -> REVIEWED (ADMIN). */
  async markReviewed(id: number) {
    const o = await this.prisma.orderRequest.findUnique({ where: { id } });
    if (!o) throw new NotFoundException({ detail: 'No encontrado.' });
    if (o.status === 'REVIEWED')
      throw new BadRequestException({
        detail: 'La solicitud ya fue marcada como revisada.',
      });
    await this.prisma.orderRequest.update({
      where: { id },
      data: { status: 'REVIEWED' },
    });
    return this.retrieve(id);
  }

  async remove(id: number, actor: AuditActor) {
    const o = await this.prisma.orderRequest.findUnique({ where: { id } });
    if (!o) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Solicitud de pedido #${id}`,
    });
    await this.prisma.orderRequest.delete({ where: { id } });
  }
}
