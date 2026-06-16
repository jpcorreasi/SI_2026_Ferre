import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Transaction } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { money, dt, dateOnly } from '../../common/serialization/format';
import { listPaginated } from '../../common/crud/list.helper';
import { parseDateOnly } from '../../common/utils/dates';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';

const APP = 'finances';
const MODEL = 'transaction';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(t: Transaction) {
    return {
      id: t.id,
      type: t.type,
      amount: money(t.amount),
      concept: t.concept,
      reference_type: t.referenceType,
      reference_id: t.referenceId,
      transaction_date: dateOnly(t.transactionDate),
      registered_by: t.registeredById,
      created_at: dt(t.createdAt),
    };
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.transaction,
      {
        filterFields: [{ param: 'type', field: 'type' }, { param: 'reference_type', field: 'referenceType' }],
        orderingFields: [
          { param: 'transaction_date', field: 'transactionDate' },
          { param: 'amount', field: 'amount' },
        ],
        defaultOrdering: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      },
      (t) => this.view(t),
    );
  }

  async retrieve(id: number) {
    const t = await this.prisma.transaction.findUnique({ where: { id } });
    if (!t) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(t);
  }

  async create(dto: CreateTransactionDto, actor: AuditActor) {
    const t = await this.prisma.transaction.create({
      data: {
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        concept: dto.concept,
        referenceType: dto.reference_type,
        referenceId: dto.reference_id,
        transactionDate: parseDateOnly(dto.transaction_date),
        registeredById: actor.userId!,
      },
    });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: t.id,
      objectRepr: `${t.type} ${t.amount} — ${t.concept}`.slice(0, 200),
    });
    return this.view(t);
  }

  async update(id: number, dto: UpdateTransactionDto, actor: AuditActor) {
    const before = await this.prisma.transaction.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    const data: Record<string, any> = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.concept !== undefined) data.concept = dto.concept;
    if (dto.reference_type !== undefined) data.referenceType = dto.reference_type;
    if (dto.reference_id !== undefined) data.referenceId = dto.reference_id;
    if (dto.transaction_date !== undefined)
      data.transactionDate = parseDateOnly(dto.transaction_date);
    const after = await this.prisma.transaction.update({ where: { id }, data });
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `${after.type} ${after.amount} — ${after.concept}`.slice(0, 200),
      changedFields: this.audit.diff(before, after, [
        'type',
        'amount',
        'concept',
        'referenceType',
        'referenceId',
        'transactionDate',
      ]),
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const t = await this.prisma.transaction.findUnique({ where: { id } });
    if (!t) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `${t.type} ${t.amount} — ${t.concept}`.slice(0, 200),
    });
    await this.prisma.transaction.delete({ where: { id } });
  }
}
