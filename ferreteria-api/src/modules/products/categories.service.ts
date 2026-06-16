import { Injectable, NotFoundException } from '@nestjs/common';
import { Category } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { listPaginated } from '../../common/crud/list.helper';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

const APP = 'products';
const MODEL = 'category';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(c: Category) {
    return { id: c.id, name: c.name, description: c.description };
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.category,
      {
        searchFields: ['name'],
        orderingFields: ['name'],
        defaultOrdering: [{ name: 'asc' }],
      },
      (c) => this.view(c),
    );
  }

  async retrieve(id: number) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(c);
  }

  async create(dto: CreateCategoryDto, actor: AuditActor) {
    const c = await this.prisma.category.create({
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

  async update(id: number, dto: UpdateCategoryDto, actor: AuditActor) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    const after = await this.prisma.category.update({ where: { id }, data });
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: after.id,
      objectRepr: after.name,
      changedFields: this.audit.diff(before, after, ['name', 'description']),
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: c.id,
      objectRepr: c.name,
    });
    await this.prisma.category.delete({ where: { id } });
  }
}
