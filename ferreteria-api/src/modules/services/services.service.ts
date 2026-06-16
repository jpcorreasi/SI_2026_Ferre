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
import { parsePageParams, buildPaginated } from '../../common/pagination/pagination';
import { parseDateOnly, bogotaDayStart, bogotaDayEnd } from '../../common/utils/dates';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

const APP = 'services';
const MODEL = 'service';

const INCLUDE = {
  serviceType: true,
  customer: true,
  performedBy: true,
  registeredBy: true,
} as const;

function getFullName(u: { firstName: string; lastName: string }) {
  return `${u.firstName} ${u.lastName}`.trim();
}

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(s: any) {
    return {
      id: s.id,
      service_type: s.serviceTypeId,
      service_type_name: s.serviceType?.name ?? null,
      description: s.description,
      price: money(s.price),
      customer: s.customerId,
      customer_name: s.customer?.fullName ?? null,
      performed_by: s.performedById,
      performed_by_name: s.performedBy ? getFullName(s.performedBy) : null,
      service_date: dateOnly(s.serviceDate),
      notes: s.notes,
      registered_by: s.registeredById,
      registered_by_name: s.registeredBy?.username ?? null,
      created_at: dt(s.createdAt),
      updated_at: dt(s.updatedAt),
    };
  }

  private getFull(id: number) {
    return this.prisma.service.findUnique({ where: { id }, include: INCLUDE });
  }

  private concept(id: number, serviceTypeName: string, customerName?: string) {
    const label = customerName ?? 'Sin cliente';
    return `Servicio #${id} — ${serviceTypeName} | ${label}`;
  }

  // --- ServiceFilter + search/order ---
  private buildWhere(req: Request): Prisma.ServiceWhereInput {
    const and: Prisma.ServiceWhereInput[] = [];
    const q = req.query;
    if (q.service_type !== undefined)
      and.push({ serviceTypeId: Number(q.service_type) });
    const sd: Prisma.DateTimeFilter = {};
    if (q.service_date_after !== undefined)
      sd.gte = bogotaDayStart(String(q.service_date_after));
    if (q.service_date_before !== undefined)
      sd.lte = bogotaDayEnd(String(q.service_date_before));
    if (sd.gte || sd.lte) and.push({ serviceDate: sd });

    const search = Array.isArray(q.search) ? q.search[0] : q.search;
    if (search) {
      const text = String(search);
      and.push({
        OR: [
          { description: { contains: text, mode: 'insensitive' } },
          { customer: { fullName: { contains: text, mode: 'insensitive' } } },
          { serviceType: { name: { contains: text, mode: 'insensitive' } } },
        ],
      });
    }
    return and.length > 0 ? { AND: and } : {};
  }

  private buildOrder(req: Request): Prisma.ServiceOrderByWithRelationInput[] {
    const map: Record<string, string> = {
      service_date: 'serviceDate',
      price: 'price',
      created_at: 'createdAt',
    };
    const raw = Array.isArray(req.query.ordering)
      ? req.query.ordering[0]
      : req.query.ordering;
    if (raw) {
      const out: Prisma.ServiceOrderByWithRelationInput[] = [];
      for (const token of String(raw).split(',')) {
        const desc = token.startsWith('-');
        const key = desc ? token.slice(1) : token;
        if (map[key]) out.push({ [map[key]]: desc ? 'desc' : 'asc' } as any);
      }
      if (out.length > 0) return out;
    }
    return [{ serviceDate: 'desc' }, { createdAt: 'desc' }];
  }

  async list(req: Request) {
    const page = parsePageParams(req);
    const where = this.buildWhere(req);
    const [count, rows] = await Promise.all([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        orderBy: this.buildOrder(req),
        skip: page.skip,
        take: page.take,
        include: INCLUDE,
      }),
    ]);
    return buildPaginated(req, count, rows.map((s) => this.view(s)), page);
  }

  async retrieve(id: number) {
    const s = await this.getFull(id);
    if (!s) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(s);
  }

  async create(dto: CreateServiceDto, actor: AuditActor) {
    const price = new Prisma.Decimal(dto.price);
    if (price.lte(0))
      throw new BadRequestException({ price: ['El precio debe ser mayor a cero.'] });

    const serviceType = await this.prisma.serviceType.findUnique({
      where: { id: dto.service_type },
    });
    if (!serviceType)
      throw new BadRequestException({
        service_type: ['El tipo de servicio es obligatorio.'],
      });
    const customer = dto.customer
      ? await this.prisma.customer.findUnique({ where: { id: dto.customer } })
      : null;
    const serviceDate = parseDateOnly(dto.service_date);

    const id = await this.prisma.$transaction(async (tx) => {
      const svc = await tx.service.create({
        data: {
          serviceTypeId: dto.service_type,
          description: dto.description,
          price,
          customerId: dto.customer ?? null,
          performedById: dto.performed_by,
          serviceDate,
          notes: dto.notes ?? '',
          registeredById: actor.userId!,
        },
      });
      // signal sync_transaction_with_service -> INCOME.
      await tx.transaction.create({
        data: {
          type: 'INCOME',
          amount: price,
          concept: this.concept(svc.id, serviceType.name, customer?.fullName),
          referenceType: 'SERVICE',
          referenceId: svc.id,
          transactionDate: serviceDate,
          registeredById: actor.userId!,
        },
      });
      return svc.id;
    });

    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Servicio #${id}`,
    });
    return this.retrieve(id);
  }

  async update(id: number, dto: UpdateServiceDto, actor: AuditActor) {
    const before = await this.getFull(id);
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    if (dto.price !== undefined && new Prisma.Decimal(dto.price).lte(0))
      throw new BadRequestException({ price: ['El precio debe ser mayor a cero.'] });

    await this.prisma.$transaction(async (tx) => {
      const data: Record<string, any> = {};
      if (dto.service_type !== undefined) data.serviceTypeId = dto.service_type;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.price !== undefined) data.price = new Prisma.Decimal(dto.price);
      if (dto.customer !== undefined) data.customerId = dto.customer;
      if (dto.performed_by !== undefined) data.performedById = dto.performed_by;
      if (dto.service_date !== undefined)
        data.serviceDate = parseDateOnly(dto.service_date);
      if (dto.notes !== undefined) data.notes = dto.notes;

      const svc = await tx.service.update({
        where: { id },
        data,
        include: { serviceType: true, customer: true },
      });
      // signal: sincroniza la Transaction INCOME asociada.
      await tx.transaction.updateMany({
        where: { referenceType: 'SERVICE', referenceId: id },
        data: {
          amount: svc.price,
          concept: this.concept(
            svc.id,
            svc.serviceType.name,
            svc.customer?.fullName,
          ),
          transactionDate: svc.serviceDate,
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
      objectRepr: `Servicio #${id}`,
      changedFields: this.audit.diff(before, after as any, [
        'serviceTypeId',
        'description',
        'price',
        'customerId',
        'performedById',
        'serviceDate',
        'notes',
      ]),
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const s = await this.prisma.service.findUnique({ where: { id } });
    if (!s) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Servicio #${id}`,
    });
    // Paridad Django: el signal no borra la Transaction al eliminar el servicio.
    await this.prisma.service.delete({ where: { id } });
  }
}
