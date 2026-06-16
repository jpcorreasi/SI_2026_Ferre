import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { listPaginated } from '../../common/crud/list.helper';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto';

const APP = 'sales';
const MODEL = 'paymentmethod';

@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(pm: PaymentMethod) {
    return { id: pm.id, name: pm.name };
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.paymentMethod,
      {
        searchFields: ['name'],
        orderingFields: ['name'],
        defaultOrdering: [{ name: 'asc' }],
      },
      (pm) => this.view(pm),
    );
  }

  async retrieve(id: number) {
    const pm = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!pm) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(pm);
  }

  async create(dto: CreatePaymentMethodDto, actor: AuditActor) {
    const pm = await this.prisma.paymentMethod.create({
      data: { name: dto.name },
    });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: pm.id,
      objectRepr: pm.name,
    });
    return this.view(pm);
  }

  async update(id: number, dto: UpdatePaymentMethodDto, actor: AuditActor) {
    const before = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    const after = await this.prisma.paymentMethod.update({
      where: { id },
      data: { name: dto.name ?? before.name },
    });
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: after.id,
      objectRepr: after.name,
      changedFields: this.audit.diff(before, after, ['name']),
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const pm = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!pm) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: pm.id,
      objectRepr: pm.name,
    });
    await this.prisma.paymentMethod.delete({ where: { id } });
  }
}
