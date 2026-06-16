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
import { parseDateOnly, utcToday } from '../../common/utils/dates';
import { CreatePayrollDto, UpdatePayrollDto } from './dto/payroll.dto';

const APP = 'employees';
const MODEL = 'payroll';

const INCLUDE = { items: { orderBy: { id: 'asc' } } } as const;

@Injectable()
export class PayrollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(p: any) {
    return {
      id: p.id,
      period_start: dateOnly(p.periodStart),
      period_end: dateOnly(p.periodEnd),
      status: p.status,
      total_amount: money(p.totalAmount),
      generated_by: p.generatedById,
      items: (p.items ?? []).map((it: any) => ({
        id: it.id,
        employee: it.employeeId,
        base_salary: money(it.baseSalary),
        health_deduction: money(it.healthDeduction),
        pension_deduction: money(it.pensionDeduction),
        overtime: money(it.overtime),
        net_salary: money(it.netSalary),
      })),
      created_at: dt(p.createdAt),
    };
  }

  private getFull(id: number) {
    return this.prisma.payroll.findUnique({ where: { id }, include: INCLUDE });
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.payroll,
      {
        filterFields: [{ param: 'status', field: 'status' }],
        orderingFields: [
          { param: 'period_start', field: 'periodStart' },
          { param: 'period_end', field: 'periodEnd' },
        ],
        defaultOrdering: [{ periodEnd: 'desc' }],
      },
      (p) => this.view(p),
      { include: INCLUDE },
    );
  }

  async retrieve(id: number) {
    const p = await this.getFull(id);
    if (!p) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(p);
  }

  async create(dto: CreatePayrollDto, actor: AuditActor) {
    const p = await this.prisma.payroll.create({
      data: {
        periodStart: parseDateOnly(dto.period_start),
        periodEnd: parseDateOnly(dto.period_end),
        totalAmount: new Prisma.Decimal(dto.total_amount),
        status: dto.status ?? 'DRAFT',
        generatedById: actor.userId!,
      },
    });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: p.id,
      objectRepr: `Nómina #${p.id}`,
    });
    return this.retrieve(p.id);
  }

  async update(id: number, dto: UpdatePayrollDto, actor: AuditActor) {
    const before = await this.prisma.payroll.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    const data: Record<string, any> = {};
    if (dto.period_start !== undefined)
      data.periodStart = parseDateOnly(dto.period_start);
    if (dto.period_end !== undefined)
      data.periodEnd = parseDateOnly(dto.period_end);
    if (dto.total_amount !== undefined)
      data.totalAmount = new Prisma.Decimal(dto.total_amount);

    // Si status pasa a APPROVED via update, tambien dispara la Transaction.
    let approveTransition = false;
    if (dto.status !== undefined && dto.status !== before.status) {
      data.status = dto.status;
      if (before.status !== 'APPROVED' && dto.status === 'APPROVED')
        approveTransition = true;
    }

    const after = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.payroll.update({ where: { id }, data });
      if (approveTransition) await this.createPayrollTransaction(tx, upd);
      return upd;
    });

    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Nómina #${id}`,
      changedFields: this.audit.diff(before, after, [
        'periodStart',
        'periodEnd',
        'totalAmount',
        'status',
      ]),
    });
    return this.retrieve(id);
  }

  /** POST /payrolls/{id}/approve/ — DRAFT -> APPROVED + Transaction(EXPENSE). */
  async approve(id: number) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } });
    if (!payroll) throw new NotFoundException({ detail: 'No encontrado.' });
    if (payroll.status === 'APPROVED')
      throw new BadRequestException({ detail: 'La nomina ya esta aprobada.' });
    if (payroll.status === 'PAID')
      throw new BadRequestException({
        detail: 'No se puede aprobar una nomina ya pagada.',
      });

    await this.prisma.$transaction(async (tx) => {
      const upd = await tx.payroll.update({
        where: { id },
        data: { status: 'APPROVED' },
      });
      await this.createPayrollTransaction(tx, upd);
    });
    return this.retrieve(id);
  }

  private async createPayrollTransaction(tx: Prisma.TransactionClient, p: any) {
    await tx.transaction.create({
      data: {
        type: 'EXPENSE',
        amount: p.totalAmount,
        concept: `Nómina ${dateOnly(p.periodStart)} — ${dateOnly(p.periodEnd)}`,
        referenceType: 'PAYROLL',
        referenceId: p.id,
        transactionDate: utcToday(),
        registeredById: p.generatedById,
      },
    });
  }

  async remove(id: number, actor: AuditActor) {
    const p = await this.prisma.payroll.findUnique({ where: { id } });
    if (!p) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Nómina #${id}`,
    });
    await this.prisma.payroll.delete({ where: { id } });
  }
}
