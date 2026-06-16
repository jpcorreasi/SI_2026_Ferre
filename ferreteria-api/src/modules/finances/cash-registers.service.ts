import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, CashRegister } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { money, dt } from '../../common/serialization/format';
import { listPaginated } from '../../common/crud/list.helper';
import { bogotaToday } from '../../common/utils/dates';
import {
  CreateCashRegisterDto,
  UpdateCashRegisterDto,
} from './dto/cash-register.dto';

const APP = 'finances';
const MODEL = 'cashregister';

interface Balance {
  income: Prisma.Decimal;
  expense: Prisma.Decimal;
  balance: Prisma.Decimal;
}

@Injectable()
export class CashRegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(r: CashRegister) {
    return {
      id: r.id,
      opened_by: r.openedById,
      closed_by: r.closedById,
      opening_amount: money(r.openingAmount),
      closing_amount: money(r.closingAmount),
      expected_amount: money(r.expectedAmount),
      difference: money(r.difference),
      opened_at: dt(r.openedAt),
      closed_at: dt(r.closedAt),
      status: r.status,
    };
  }

  private pesos(d: Prisma.Decimal): string {
    return (
      '$' +
      Number(d).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  /** income/expense/balance — paridad _register_balance (created_at >= opened_at). */
  private async computeBalance(
    register: CashRegister,
    upper?: Date,
  ): Promise<Balance> {
    const where = (type: 'INCOME' | 'EXPENSE') => ({
      type,
      createdAt: { gte: register.openedAt, ...(upper ? { lte: upper } : {}) },
    });
    const [inc, exp] = await Promise.all([
      this.prisma.transaction.aggregate({ _sum: { amount: true }, where: where('INCOME') as any }),
      this.prisma.transaction.aggregate({ _sum: { amount: true }, where: where('EXPENSE') as any }),
    ]);
    const income = inc._sum.amount ?? new Prisma.Decimal(0);
    const expense = exp._sum.amount ?? new Prisma.Decimal(0);
    return {
      income,
      expense,
      balance: register.openingAmount.add(income).sub(expense),
    };
  }

  list(req: Request) {
    return listPaginated(
      req,
      this.prisma.cashRegister,
      {
        filterFields: [{ param: 'status', field: 'status' }],
        orderingFields: [{ param: 'opened_at', field: 'openedAt' }],
        defaultOrdering: [{ openedAt: 'desc' }],
      },
      (r) => this.view(r),
    );
  }

  async retrieve(id: number) {
    const r = await this.prisma.cashRegister.findUnique({ where: { id } });
    if (!r) throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(r);
  }

  async create(dto: CreateCashRegisterDto, actor: AuditActor) {
    const r = await this.prisma.cashRegister.create({
      data: {
        openedById: actor.userId!,
        openingAmount: new Prisma.Decimal(dto.opening_amount),
        status: 'OPEN',
      },
    });
    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: r.id,
      objectRepr: `Caja #${r.id}`,
    });
    return this.view(r);
  }

  async update(id: number, dto: UpdateCashRegisterDto, actor: AuditActor) {
    const before = await this.prisma.cashRegister.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    const data: Record<string, any> = {};
    if (dto.opening_amount !== undefined)
      data.openingAmount = new Prisma.Decimal(dto.opening_amount);
    if (dto.closing_amount !== undefined)
      data.closingAmount = new Prisma.Decimal(dto.closing_amount);
    if (dto.status !== undefined) data.status = dto.status;
    const after = await this.prisma.cashRegister.update({ where: { id }, data });
    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Caja #${id}`,
      changedFields: this.audit.diff(before, after, [
        'openingAmount',
        'closingAmount',
        'status',
      ]),
    });
    return this.view(after);
  }

  async remove(id: number, actor: AuditActor) {
    const r = await this.prisma.cashRegister.findUnique({ where: { id } });
    if (!r) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Caja #${id}`,
    });
    await this.prisma.cashRegister.delete({ where: { id } });
  }

  // -------------------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------------------
  async close(id: number, body: any, actor: AuditActor) {
    const register = await this.prisma.cashRegister.findUnique({ where: { id } });
    if (!register) throw new NotFoundException({ detail: 'No encontrado.' });
    if (register.status === 'CLOSED')
      throw new BadRequestException({ detail: 'La caja ya esta cerrada.' });

    const raw = body?.closing_amount;
    if (raw === undefined || raw === null)
      throw new BadRequestException({ detail: 'Se requiere closing_amount.' });
    let closingAmount: Prisma.Decimal;
    try {
      closingAmount = new Prisma.Decimal(String(raw));
    } catch {
      throw new BadRequestException({
        detail: 'closing_amount debe ser un numero decimal valido.',
      });
    }

    const closedAt = new Date();
    const bal = await this.computeBalance(register, closedAt);
    const expected = register.openingAmount.add(bal.income).sub(bal.expense);

    const updated = await this.prisma.cashRegister.update({
      where: { id },
      data: {
        closingAmount,
        expectedAmount: expected,
        difference: closingAmount.sub(expected),
        closedById: actor.userId!,
        closedAt,
        status: 'CLOSED',
      },
    });
    return this.view(updated);
  }

  async balance(id: number) {
    const register = await this.prisma.cashRegister.findUnique({ where: { id } });
    if (!register) throw new NotFoundException({ detail: 'No encontrado.' });
    const bal = await this.computeBalance(register);
    return {
      register_id: register.id,
      opening_amount: money(register.openingAmount),
      income: money(bal.income),
      expense: money(bal.expense),
      balance: money(bal.balance),
      status: register.status,
    };
  }

  async withdraw(id: number, body: any, user: AuthUser, ip: string | null) {
    const register = await this.prisma.cashRegister.findUnique({ where: { id } });
    if (!register) throw new NotFoundException({ detail: 'No encontrado.' });

    if (register.status !== 'OPEN')
      throw new BadRequestException({
        detail: 'Solo se puede retirar dinero de una caja abierta.',
      });

    const concept = String(body?.concept ?? '').trim();
    if (!concept)
      throw new BadRequestException({
        concept: 'El motivo del retiro es obligatorio.',
      });

    const rawAmount = body?.amount;
    if (rawAmount === undefined || rawAmount === null)
      throw new BadRequestException({ amount: 'El monto es obligatorio.' });
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(String(rawAmount));
    } catch {
      throw new BadRequestException({
        amount: 'El monto debe ser un número decimal válido.',
      });
    }
    if (amount.lte(0))
      throw new BadRequestException({ amount: 'El monto debe ser mayor a cero.' });

    const bal = await this.computeBalance(register);
    if (amount.gt(bal.balance))
      throw new BadRequestException({
        amount: `El monto a retirar (${this.pesos(amount)}) supera el saldo disponible en caja (${this.pesos(bal.balance)}).`,
      });

    const txn = await this.prisma.transaction.create({
      data: {
        type: 'EXPENSE',
        amount,
        concept,
        referenceType: 'WITHDRAWAL',
        referenceId: register.id,
        transactionDate: bogotaToday(),
        registeredById: user.id,
      },
    });

    return {
      detail: 'Retiro registrado correctamente.',
      transaction_id: txn.id,
      amount: money(amount),
      concept,
      new_balance: money(bal.balance.sub(amount)),
      registered_by: user.username,
    };
  }
}
