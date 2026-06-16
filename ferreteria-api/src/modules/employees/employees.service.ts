import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { FieldCryptoService } from '../../common/crypto/field-crypto.service';
import { makePassword } from '../../common/crypto/django-password';
import { money, dateOnly } from '../../common/serialization/format';
import { listPaginated } from '../../common/crud/list.helper';
import { parseDateOnly } from '../../common/utils/dates';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

const APP = 'employees';
const MODEL = 'employee';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: FieldCryptoService,
  ) {}

  /** EmployeeViewSet es ADMIN-only -> siempre vista completa (documento en claro). */
  private view(e: any) {
    return {
      id: e.id,
      user: e.userId,
      username_display: e.user?.username ?? null,
      full_name: e.fullName,
      document_type: e.documentType,
      document_number: this.crypto.decrypt(e.documentNumber),
      position: e.position,
      hire_date: dateOnly(e.hireDate),
      base_salary: money(e.baseSalary),
      phone: e.phone,
      is_active: e.isActive,
    };
  }

  private getFull(id: number) {
    return this.prisma.employee.findUnique({
      where: { id },
      include: { user: true },
    });
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.employee,
      {
        searchFields: ['fullName', 'position'],
        orderingFields: [
          { param: 'full_name', field: 'fullName' },
          { param: 'hire_date', field: 'hireDate' },
        ],
        defaultOrdering: [{ fullName: 'asc' }],
      },
      (e) => this.view(e),
      { include: { user: true } },
    );
  }

  async retrieve(id: number) {
    const e = await this.getFull(id);
    if (!e) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(e);
  }

  async create(dto: CreateEmployeeDto, actor: AuditActor) {
    const id = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: dto.username,
          password: makePassword(dto.password),
          role: 'EMPLEADO',
          isActive: true,
        },
      });
      const employee = await tx.employee.create({
        data: {
          userId: user.id,
          fullName: dto.full_name,
          documentType: dto.document_type,
          documentNumber: this.crypto.encrypt(dto.document_number),
          position: dto.position,
          hireDate: parseDateOnly(dto.hire_date),
          baseSalary: new Prisma.Decimal(dto.base_salary),
          phone: dto.phone ?? '',
          isActive: dto.is_active ?? true,
        },
      });
      return employee.id;
    });

    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: dto.full_name,
    });
    return this.retrieve(id);
  }

  async update(id: number, dto: UpdateEmployeeDto, actor: AuditActor) {
    const before = await this.getFull(id);
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });

    await this.prisma.$transaction(async (tx) => {
      if (dto.username || dto.password) {
        const userData: Record<string, any> = {};
        if (dto.username) userData.username = dto.username;
        if (dto.password) userData.password = makePassword(dto.password);
        await tx.user.update({ where: { id: before.userId }, data: userData });
      }
      const data: Record<string, any> = {};
      if (dto.full_name !== undefined) data.fullName = dto.full_name;
      if (dto.document_type !== undefined) data.documentType = dto.document_type;
      if (dto.document_number !== undefined)
        data.documentNumber = this.crypto.encrypt(dto.document_number);
      if (dto.position !== undefined) data.position = dto.position;
      if (dto.hire_date !== undefined) data.hireDate = parseDateOnly(dto.hire_date);
      if (dto.base_salary !== undefined)
        data.baseSalary = new Prisma.Decimal(dto.base_salary);
      if (dto.phone !== undefined) data.phone = dto.phone;
      if (dto.is_active !== undefined) data.isActive = dto.is_active;
      await tx.employee.update({ where: { id }, data });
    });

    const after = await this.getFull(id);
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: after!.fullName,
      changedFields: this.audit.diff(before, after as any, [
        'fullName',
        'documentType',
        'position',
        'baseSalary',
        'phone',
        'isActive',
      ]),
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const e = await this.prisma.employee.findUnique({ where: { id } });
    if (!e) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: e.fullName,
    });
    await this.prisma.employee.delete({ where: { id } });
  }
}
