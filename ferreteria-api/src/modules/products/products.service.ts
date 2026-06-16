import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { money, dt } from '../../common/serialization/format';
import {
  parsePageParams,
  buildPaginated,
} from '../../common/pagination/pagination';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

const APP = 'products';
const MODEL = 'product';

const INCLUDE = { category: true, supplier: true };

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** ProductSerializer (ADMIN / escritura) — incluye cost_price + auditoria. */
  private fullView(p: any) {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      category: p.categoryId,
      category_name: p.category?.name ?? null,
      sale_price: money(p.salePrice),
      cost_price: money(p.costPrice),
      stock: p.stock,
      min_stock: p.minStock,
      supplier: p.supplierId,
      supplier_name: p.supplier?.businessName ?? null,
      is_active: p.isActive,
      is_low_stock: p.stock <= p.minStock,
      created_by: p.createdById,
      created_at: dt(p.createdAt),
      updated_at: dt(p.updatedAt),
    };
  }

  /** ProductListSerializer (EMPLEADO lectura) — sin cost_price. */
  private listView(p: any) {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      category: p.categoryId,
      category_name: p.category?.name ?? null,
      sale_price: money(p.salePrice),
      stock: p.stock,
      min_stock: p.minStock,
      supplier: p.supplierId,
      supplier_name: p.supplier?.businessName ?? null,
      is_active: p.isActive,
      is_low_stock: p.stock <= p.minStock,
    };
  }

  private readView(p: any, role: Role) {
    return role === 'ADMIN' ? this.fullView(p) : this.listView(p);
  }

  // --- ProductFilter: category, is_active, min_price, max_price ---
  private buildWhere(req: Request): Prisma.ProductWhereInput {
    const and: Prisma.ProductWhereInput[] = [];
    const q = req.query;

    if (q.category !== undefined) and.push({ categoryId: Number(q.category) });
    if (q.is_active !== undefined)
      and.push({ isActive: String(q.is_active) === 'true' });
    if (q.min_price !== undefined)
      and.push({ salePrice: { gte: new Prisma.Decimal(String(q.min_price)) } });
    if (q.max_price !== undefined)
      and.push({ salePrice: { lte: new Prisma.Decimal(String(q.max_price)) } });

    const search = Array.isArray(q.search) ? q.search[0] : q.search;
    if (search) {
      and.push({
        OR: [
          { name: { contains: String(search), mode: 'insensitive' } },
          { code: { contains: String(search), mode: 'insensitive' } },
        ],
      });
    }
    return and.length > 0 ? { AND: and } : {};
  }

  private buildOrder(req: Request): Prisma.ProductOrderByWithRelationInput[] {
    const map: Record<string, string> = {
      name: 'name',
      sale_price: 'salePrice',
      stock: 'stock',
    };
    const raw = Array.isArray(req.query.ordering)
      ? req.query.ordering[0]
      : req.query.ordering;
    if (raw) {
      const out: Prisma.ProductOrderByWithRelationInput[] = [];
      for (const token of String(raw).split(',')) {
        const desc = token.startsWith('-');
        const key = desc ? token.slice(1) : token;
        if (map[key]) out.push({ [map[key]]: desc ? 'desc' : 'asc' } as any);
      }
      if (out.length > 0) return out;
    }
    return [{ name: 'asc' }];
  }

  async list(req: Request, role: Role) {
    const page = parsePageParams(req);
    const where = this.buildWhere(req);
    const [count, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: this.buildOrder(req),
        skip: page.skip,
        take: page.take,
        include: INCLUDE,
      }),
    ]);
    return buildPaginated(
      req,
      count,
      rows.map((p) => this.readView(p, role)),
      page,
    );
  }

  async retrieve(id: number, role: Role) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!p) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.readView(p, role);
  }

  async lowStock(role: Role) {
    // stock <= min_stock (comparacion entre columnas) -> filtrado en memoria.
    const rows = await this.prisma.product.findMany({
      orderBy: { stock: 'asc' },
      include: INCLUDE,
    });
    return rows
      .filter((p) => p.stock <= p.minStock)
      .map((p) => this.readView(p, role));
  }

  private async assertNameUnique(name: string, excludeId?: number) {
    const existing = await this.prisma.product.findFirst({
      where: {
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException({
        name: ['Ya existe un producto con este nombre. Verifique el catálogo.'],
      });
    }
  }

  async create(dto: CreateProductDto, actor: AuditActor) {
    await this.assertNameUnique(dto.name);
    const p = await this.prisma.product.create({
      data: {
        code: dto.code,
        name: dto.name.trim(),
        description: dto.description ?? '',
        categoryId: dto.category,
        salePrice: new Prisma.Decimal(dto.sale_price),
        costPrice: new Prisma.Decimal(dto.cost_price ?? '0'),
        stock: dto.stock ?? 0,
        minStock: dto.min_stock ?? 5,
        supplierId: dto.supplier ?? null,
        isActive: dto.is_active ?? true,
        createdById: actor.userId!,
      },
      include: INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: p.id,
      objectRepr: `${p.name} (${p.code})`,
    });
    // create siempre usa ProductSerializer (full), incluso para EMPLEADO.
    return this.fullView(p);
  }

  async update(id: number, dto: UpdateProductDto, actor: AuditActor) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    if (dto.name !== undefined) await this.assertNameUnique(dto.name, id);

    const data: Prisma.ProductUpdateInput = {};
    if (dto.code !== undefined) data.code = dto.code;
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined)
      data.category = { connect: { id: dto.category } };
    if (dto.sale_price !== undefined)
      data.salePrice = new Prisma.Decimal(dto.sale_price);
    if (dto.cost_price !== undefined)
      data.costPrice = new Prisma.Decimal(dto.cost_price);
    if (dto.stock !== undefined) data.stock = dto.stock;
    if (dto.min_stock !== undefined) data.minStock = dto.min_stock;
    if (dto.supplier !== undefined)
      data.supplier =
        dto.supplier === null
          ? { disconnect: true }
          : { connect: { id: dto.supplier } };
    if (dto.is_active !== undefined) data.isActive = dto.is_active;

    const after = await this.prisma.product.update({
      where: { id },
      data,
      include: INCLUDE,
    });

    const changed = this.audit.diff(before, after, [
      'code',
      'name',
      'description',
      'categoryId',
      'salePrice',
      'costPrice',
      'stock',
      'minStock',
      'supplierId',
      'isActive',
    ]);
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: after.id,
      objectRepr: `${after.name} (${after.code})`,
      changedFields: changed,
    });
    return this.fullView(after);
  }

  async remove(id: number, actor: AuditActor) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: p.id,
      objectRepr: `${p.name} (${p.code})`,
    });
    await this.prisma.product.delete({ where: { id } });
  }
}
