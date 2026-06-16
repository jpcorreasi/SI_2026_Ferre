import { Injectable, NotFoundException } from '@nestjs/common';
import { Customer, Role } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { FieldCryptoService } from '../../common/crypto/field-crypto.service';
import { listPaginated } from '../../common/crud/list.helper';
import { dt } from '../../common/serialization/format';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

const APP = 'customers';
const MODEL = 'customer';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: FieldCryptoService,
  ) {}

  /** AdminCustomerSerializer — document_number en claro. */
  private adminView(c: Customer) {
    return {
      id: c.id,
      full_name: c.fullName,
      document_type: c.documentType,
      document_number: this.crypto.decrypt(c.documentNumber),
      email: c.email,
      phone: c.phone,
      address: c.address,
      is_active: c.isActive,
      created_by: c.createdById,
      created_at: dt(c.createdAt),
      updated_at: dt(c.updatedAt),
    };
  }

  /** EmployeeCustomerSerializer — document_number enmascarado. */
  private employeeView(c: Customer) {
    return {
      id: c.id,
      full_name: c.fullName,
      document_type: c.documentType,
      document_number: FieldCryptoService.MASK,
      email: c.email,
      phone: c.phone,
      address: c.address,
      is_active: c.isActive,
    };
  }

  /** EmployeeCustomerUpdateSerializer — solo contacto. */
  private employeeUpdateView(c: Customer) {
    return { email: c.email, phone: c.phone, address: c.address };
  }

  private viewFor(c: Customer, role: Role) {
    return role === 'ADMIN' ? this.adminView(c) : this.employeeView(c);
  }

  list(req: Request, role: Role) {
    return listPaginated(
      req,
      this.prisma.customer,
      {
        searchFields: ['fullName', 'email'],
        filterFields: [
          { param: 'is_active', field: 'isActive' },
          { param: 'document_type', field: 'documentType' },
        ],
        orderingFields: [
          { param: 'full_name', field: 'fullName' },
          { param: 'created_at', field: 'createdAt' },
        ],
        defaultOrdering: [{ fullName: 'asc' }],
      },
      (c) => this.viewFor(c, role),
    );
  }

  async retrieve(id: number, role: Role) {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.viewFor(c, role);
  }

  async create(dto: CreateCustomerDto, actor: AuditActor) {
    const c = await this.prisma.customer.create({
      data: {
        fullName: dto.full_name,
        documentType: dto.document_type,
        documentNumber: this.crypto.encrypt(dto.document_number),
        email: dto.email ?? '',
        phone: dto.phone ?? '',
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
      objectId: c.id,
      objectRepr: c.fullName,
    });
    return this.adminView(c);
  }

  async update(
    id: number,
    dto: UpdateCustomerDto,
    actor: AuditActor,
    role: Role,
  ) {
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });

    const data: Record<string, any> = {};
    if (role === 'ADMIN') {
      if (dto.full_name !== undefined) data.fullName = dto.full_name;
      if (dto.document_type !== undefined) data.documentType = dto.document_type;
      if (dto.document_number !== undefined)
        data.documentNumber = this.crypto.encrypt(dto.document_number);
      if (dto.is_active !== undefined) data.isActive = dto.is_active;
    }
    // Campos de contacto: permitidos para ambos roles.
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.address !== undefined) data.address = dto.address;

    const after = await this.prisma.customer.update({ where: { id }, data });

    // Diff sobre valores en claro (paridad con Django: document_number descifrado).
    const changed = this.audit.diff(
      this.plain(before),
      this.plain(after),
      ['full_name', 'document_type', 'document_number', 'email', 'phone', 'address', 'is_active'],
    );
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: after.id,
      objectRepr: after.fullName,
      changedFields: changed,
    });

    return role === 'ADMIN'
      ? this.adminView(after)
      : this.employeeUpdateView(after);
  }

  async remove(id: number, actor: AuditActor) {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: c.id,
      objectRepr: c.fullName,
    });
    await this.prisma.customer.delete({ where: { id } });
  }

  /** Snapshot en claro para el diff de auditoria. */
  private plain(c: Customer) {
    return {
      full_name: c.fullName,
      document_type: c.documentType,
      document_number: this.crypto.decrypt(c.documentNumber),
      email: c.email,
      phone: c.phone,
      address: c.address,
      is_active: c.isActive,
    };
  }
}
