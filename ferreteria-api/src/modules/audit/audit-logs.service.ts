import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { dt } from '../../common/serialization/format';
import { parsePageParams, buildPaginated } from '../../common/pagination/pagination';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  private view(log: any) {
    return {
      id: log.id,
      user: log.userId,
      username: log.user?.username ?? 'Sistema',
      action: log.action,
      app_label: log.appLabel,
      model_name: log.modelName,
      object_id: log.objectId,
      object_repr: log.objectRepr,
      changed_fields: log.changedFields,
      timestamp: dt(log.timestamp),
      ip_address: log.ipAddress,
    };
  }

  // AuditLogFilter + SearchFilter
  private buildWhere(req: Request): Prisma.AuditLogWhereInput {
    const and: Prisma.AuditLogWhereInput[] = [];
    const q = req.query;

    if (q.action !== undefined) and.push({ action: String(q.action) as any });
    if (q.model_name !== undefined)
      and.push({ modelName: { equals: String(q.model_name), mode: 'insensitive' } });
    if (q.username !== undefined)
      and.push({
        user: { username: { contains: String(q.username), mode: 'insensitive' } },
      });
    const ts: Prisma.DateTimeFilter = {};
    if (q.timestamp_from !== undefined) ts.gte = new Date(String(q.timestamp_from));
    if (q.timestamp_to !== undefined) ts.lte = new Date(String(q.timestamp_to));
    if (ts.gte || ts.lte) and.push({ timestamp: ts });

    const search = Array.isArray(q.search) ? q.search[0] : q.search;
    if (search) {
      const text = String(search);
      and.push({
        OR: [
          { objectRepr: { contains: text, mode: 'insensitive' } },
          { modelName: { contains: text, mode: 'insensitive' } },
          { user: { username: { contains: text, mode: 'insensitive' } } },
        ],
      });
    }
    return and.length > 0 ? { AND: and } : {};
  }

  private buildOrder(req: Request): Prisma.AuditLogOrderByWithRelationInput[] {
    const raw = Array.isArray(req.query.ordering)
      ? req.query.ordering[0]
      : req.query.ordering;
    if (raw) {
      const out: Prisma.AuditLogOrderByWithRelationInput[] = [];
      for (const token of String(raw).split(',')) {
        const desc = token.startsWith('-');
        const key = desc ? token.slice(1) : token;
        if (key === 'timestamp') out.push({ timestamp: desc ? 'desc' : 'asc' });
      }
      if (out.length > 0) return out;
    }
    return [{ timestamp: 'desc' }];
  }

  async list(req: Request) {
    const page = parsePageParams(req);
    const where = this.buildWhere(req);
    const [count, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: this.buildOrder(req),
        skip: page.skip,
        take: page.take,
        include: { user: true },
      }),
    ]);
    return buildPaginated(req, count, rows.map((l) => this.view(l)), page);
  }

  async retrieve(id: number) {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!log) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(log);
  }
}
