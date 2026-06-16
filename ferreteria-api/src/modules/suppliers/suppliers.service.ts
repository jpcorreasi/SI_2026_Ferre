import { Injectable, NotFoundException } from '@nestjs/common';
import { Supplier } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { listPaginated } from '../../common/crud/list.helper';
import { dt } from '../../common/serialization/format';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

const APP = 'suppliers';
const MODEL = 'supplier';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(s: Supplier) {
    return {
      id: s.id,
      business_name: s.businessName,
      nit: s.nit,
      contact_name: s.contactName,
      phone: s.phone,
      email: s.email,
      address: s.address,
      is_active: s.isActive,
      created_by: s.createdById,
      created_at: dt(s.createdAt),
      updated_at: dt(s.updatedAt),
    };
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.supplier,
      {
        searchFields: ['businessName', 'contactName', 'email'],
        orderingFields: [{ param: 'business_name', field: 'businessName' }],
        defaultOrdering: [{ businessName: 'asc' }],
      },
      (s) => this.view(s),
    );
  }

  async retrieve(id: number) {
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(s);
  }

  async create(dto: CreateSupplierDto, actor: AuditActor) {
    const s = await this.prisma.supplier.create({
      data: {
        businessName: dto.business_name,
        nit: dto.nit,
        contactName: dto.contact_name ?? '',
        phone: dto.phone ?? '',
        email: dto.email ?? '',
        address: dto.address ?? '',
        isActive: dto.is_active ?? true,
        createdById: actor.userId!,
      },
    });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: s.id,
      objectRepr: s.businessName,
    });
    return this.view(s);
  }

  async update(id: number, dto: UpdateSupplierDto, actor: AuditActor) {
    const before = await this.prisma.supplier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });

    const data: Record<string, any> = {};
    if (dto.business_name !== undefined) data.businessName = dto.business_name;
    if (dto.nit !== undefined) data.nit = dto.nit;
    if (dto.contact_name !== undefined) data.contactName = dto.contact_name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.is_active !== undefined) data.isActive = dto.is_active;

    const after = await this.prisma.supplier.update({ where: { id }, data });
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: after.id,
      objectRepr: after.businessName,
      changedFields: this.audit.diff(before, after, [
        'businessName',
        'nit',
        'contactName',
        'phone',
        'email',
        'address',
        'isActive',
      ]),
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: s.id,
      objectRepr: s.businessName,
    });
    await this.prisma.supplier.delete({ where: { id } });
  }
}
