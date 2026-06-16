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
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';

const APP = 'finances';
const MODEL = 'expense';

const INCLUDE = { category: true } as const;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(e: any) {
    return {
      id: e.id,
      description: e.description,
      category: e.categoryId,
      category_name: e.category?.name ?? null,
      amount: money(e.amount),
      expense_date: dateOnly(e.expenseDate),
      payment_method: e.paymentMethod,
      receipt_reference: e.receiptReference,
      notes: e.notes,
      registered_by: e.registeredById,
      created_at: dt(e.createdAt),
      updated_at: dt(e.updatedAt),
    };
  }

  private getFull(id: number) {
    return this.prisma.expense.findUnique({ where: { id }, include: INCLUDE });
  }

  private concept(id: number, description: string, categoryName: string) {
    return `Gasto #${id} — ${description} [${categoryName}]`;
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.expense,
      {
        searchFields: ['description'],
        filterFields: [{ param: 'category', field: 'categoryId' }, { param: 'payment_method', field: 'paymentMethod' }],
        orderingFields: [
          { param: 'expense_date', field: 'expenseDate' },
          { param: 'amount', field: 'amount' },
        ],
        defaultOrdering: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      },
      (e) => this.view(e),
      { include: INCLUDE },
    );
  }

  async retrieve(id: number) {
    const e = await this.getFull(id);
    if (!e) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(e);
  }

  async create(dto: CreateExpenseDto, actor: AuditActor) {
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0))
      throw new BadRequestException({ amount: ['El monto debe ser mayor a cero.'] });

    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: dto.category },
    });
    if (!category)
      throw new BadRequestException({ category: ['La categoría es obligatoria.'] });

    const expenseDate = parseDateOnly(dto.expense_date);

    const id = await this.prisma.$transaction(async (tx) => {
      const e = await tx.expense.create({
        data: {
          description: dto.description,
          categoryId: dto.category,
          amount,
          expenseDate,
          paymentMethod: dto.payment_method,
          receiptReference: dto.receipt_reference ?? '',
          notes: dto.notes ?? '',
          registeredById: actor.userId!,
        },
      });
      // signal sync_transaction_with_expense -> crea EXPENSE Transaction.
      await tx.transaction.create({
        data: {
          type: 'EXPENSE',
          amount,
          concept: this.concept(e.id, e.description, category.name),
          referenceType: 'EXPENSE',
          referenceId: e.id,
          transactionDate: expenseDate,
          registeredById: actor.userId!,
        },
      });
      return e.id;
    });

    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Gasto #${id}`,
    });
    return this.retrieve(id);
  }

  async update(id: number, dto: UpdateExpenseDto, actor: AuditActor) {
    const before = await this.getFull(id);
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });

    if (dto.amount !== undefined && new Prisma.Decimal(dto.amount).lte(0))
      throw new BadRequestException({ amount: ['El monto debe ser mayor a cero.'] });

    const data: Record<string, any> = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.categoryId = dto.category;
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.expense_date !== undefined)
      data.expenseDate = parseDateOnly(dto.expense_date);
    if (dto.payment_method !== undefined) data.paymentMethod = dto.payment_method;
    if (dto.receipt_reference !== undefined)
      data.receiptReference = dto.receipt_reference;
    if (dto.notes !== undefined) data.notes = dto.notes;

    await this.prisma.$transaction(async (tx) => {
      const e = await tx.expense.update({
        where: { id },
        data,
        include: INCLUDE,
      });
      // signal: sincroniza la Transaction EXPENSE asociada.
      await tx.transaction.updateMany({
        where: { referenceType: 'EXPENSE', referenceId: id },
        data: {
          amount: e.amount,
          concept: this.concept(e.id, e.description, e.category.name),
          transactionDate: e.expenseDate,
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
      objectRepr: `Gasto #${id}`,
      changedFields: this.audit.diff(before, after as any, [
        'description',
        'categoryId',
        'amount',
        'expenseDate',
        'paymentMethod',
        'receiptReference',
        'notes',
      ]),
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const e = await this.prisma.expense.findUnique({ where: { id } });
    if (!e) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Gasto #${id}`,
    });
    // Paridad Django: el signal no borra la Transaction asociada al eliminar.
    await this.prisma.expense.delete({ where: { id } });
  }
}
