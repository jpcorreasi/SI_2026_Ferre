import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseCategory } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { dt } from '../../common/serialization/format';
import { listPaginated } from '../../common/crud/list.helper';
import {
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense.dto';

const APP = 'finances';
const MODEL = 'expensecategory';

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(c: ExpenseCategory) {
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      created_at: dt(c.createdAt),
    };
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.expenseCategory,
      {
        searchFields: ['name'],
        orderingFields: ['name'],
        defaultOrdering: [{ name: 'asc' }],
      },
      (c) => this.view(c),
    );
  }

  async retrieve(id: number) {
    const c = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(c);
  }

  async create(dto: CreateExpenseCategoryDto, actor: AuditActor) {
    const c = await this.prisma.expenseCategory.create({
      data: { name: dto.name, description: dto.description ?? '' },
    });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: c.id,
      objectRepr: c.name,
    });
    return this.view(c);
  }

  async update(id: number, dto: UpdateExpenseCategoryDto, actor: AuditActor) {
    const before = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    const after = await this.prisma.expenseCategory.update({ where: { id }, data });
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: after.name,
      changedFields: this.audit.diff(before, after, ['name', 'description']),
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const c = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: c.name,
    });
    await this.prisma.expenseCategory.delete({ where: { id } });
  }
}
