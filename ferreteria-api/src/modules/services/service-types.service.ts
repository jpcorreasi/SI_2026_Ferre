import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceType } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { money, dt } from '../../common/serialization/format';
import { listPaginated } from '../../common/crud/list.helper';
import {
  CreateServiceTypeDto,
  UpdateServiceTypeDto,
} from './dto/service.dto';

const APP = 'services';
const MODEL = 'servicetype';

@Injectable()
export class ServiceTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(s: ServiceType) {
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      default_price: money(s.defaultPrice),
      created_at: dt(s.createdAt),
    };
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.serviceType,
      {
        searchFields: ['name'],
        orderingFields: ['name'],
        defaultOrdering: [{ name: 'asc' }],
      },
      (s) => this.view(s),
    );
  }

  async retrieve(id: number) {
    const s = await this.prisma.serviceType.findUnique({ where: { id } });
    if (!s) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(s);
  }

  async create(dto: CreateServiceTypeDto, actor: AuditActor) {
    const s = await this.prisma.serviceType.create({
      data: {
        name: dto.name,
        description: dto.description ?? '',
        defaultPrice:
          dto.default_price !== undefined
            ? new Prisma.Decimal(dto.default_price)
            : null,
      },
    });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: s.id,
      objectRepr: s.name,
    });
    return this.view(s);
  }

  async update(id: number, dto: UpdateServiceTypeDto, actor: AuditActor) {
    const before = await this.prisma.serviceType.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.default_price !== undefined)
      data.defaultPrice = new Prisma.Decimal(dto.default_price);
    const after = await this.prisma.serviceType.update({ where: { id }, data });
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: after.name,
      changedFields: this.audit.diff(before, after, [
        'name',
        'description',
        'defaultPrice',
      ]),
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const s = await this.prisma.serviceType.findUnique({ where: { id } });
    if (!s) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: s.name,
    });
    await this.prisma.serviceType.delete({ where: { id } });
  }
}
