import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { makePassword } from '../../common/crypto/django-password';
import { listPaginated } from '../../common/crud/list.helper';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

const APP = 'accounts';
const MODEL = 'customuser';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(u: User) {
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      is_active: u.isActive,
    };
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.user,
      {
        orderingFields: ['username', 'email'],
        defaultOrdering: [{ username: 'asc' }],
      },
      (u) => this.view(u),
    );
  }

  async retrieve(id: number) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(u);
  }

  async create(dto: CreateUserDto, actor: AuditActor) {
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email ?? '',
        role: dto.role ?? 'EMPLEADO',
        isActive: dto.is_active ?? true,
        password: dto.password ? makePassword(dto.password) : '!',
      },
    });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: user.id,
      objectRepr: user.username,
    });
    return this.view(user);
  }

  async update(id: number, dto: UpdateUserDto, actor: AuditActor, partial: boolean) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });

    const data: Record<string, any> = {};
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.is_active !== undefined) data.isActive = dto.is_active;
    if (dto.password) data.password = makePassword(dto.password);

    const user = await this.prisma.user.update({ where: { id }, data });

    const changed = this.audit.diff(before, user, [
      'username',
      'email',
      'role',
      'isActive',
    ]);
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: user.id,
      objectRepr: user.username,
      changedFields: changed,
    });
    return this.view(user);
  }

  async remove(id: number, actor: AuditActor) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: user.id,
      objectRepr: user.username,
    });
    await this.prisma.user.delete({ where: { id } });
  }
}
