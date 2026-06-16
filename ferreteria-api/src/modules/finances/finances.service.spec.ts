import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CashRegistersService } from './cash-registers.service';
import { ExpensesService } from './expenses.service';

const D = (v: string) => new Prisma.Decimal(v);
const audit = { record: jest.fn(), diff: jest.fn().mockReturnValue({}) };

/** aggregate que devuelve income/expense segun where.type. */
function aggregateByType(income: string, expense: string) {
  return jest.fn(({ where }: any) =>
    Promise.resolve({
      _sum: { amount: where.type === 'INCOME' ? D(income) : D(expense) },
    }),
  );
}

describe('CashRegistersService', () => {
  let prisma: any;
  let service: CashRegistersService;

  beforeEach(() => {
    prisma = {
      cashRegister: { findUnique: jest.fn(), update: jest.fn() },
      transaction: { aggregate: aggregateByType('50000', '20000'), create: jest.fn() },
    };
    service = new CashRegistersService(prisma, audit as any);
    jest.clearAllMocks();
    prisma.transaction.aggregate = aggregateByType('50000', '20000');
  });

  const openReg = {
    id: 1,
    openedById: 7,
    closedById: null,
    openingAmount: D('100000.00'),
    closingAmount: null,
    expectedAmount: null,
    difference: null,
    openedAt: new Date('2026-06-15T08:00:00Z'),
    closedAt: null,
    status: 'OPEN',
  };

  it('close: expected = apertura + ingresos - egresos; diferencia correcta', async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(openReg);
    prisma.cashRegister.update.mockResolvedValue({
      ...openReg,
      status: 'CLOSED',
      closingAmount: D('125000.00'),
      expectedAmount: D('130000.00'),
      difference: D('-5000.00'),
      closedById: 7,
      closedAt: new Date(),
    });

    await service.close(1, { closing_amount: '125000' }, { userId: 7, ip: null });

    const data = prisma.cashRegister.update.mock.calls[0][0].data;
    // expected = 100000 + 50000 - 20000 = 130000
    expect(data.expectedAmount.toString()).toBe('130000');
    expect(data.difference.toString()).toBe('-5000'); // 125000 - 130000
    expect(data.status).toBe('CLOSED');
  });

  it('close: caja ya cerrada -> BadRequest', async () => {
    prisma.cashRegister.findUnique.mockResolvedValue({ ...openReg, status: 'CLOSED' });
    await expect(
      service.close(1, { closing_amount: '1' }, { userId: 7, ip: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('close: sin closing_amount -> BadRequest', async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(openReg);
    await expect(
      service.close(1, {}, { userId: 7, ip: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  const user = { id: 7, username: 'admin_test', role: 'ADMIN' as const };

  it('withdraw: exito crea Transaction EXPENSE/WITHDRAWAL y devuelve saldo', async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(openReg);
    prisma.transaction.create.mockResolvedValue({ id: 99 });

    const res = await service.withdraw(
      1,
      { amount: '30000', concept: 'Pago servicios' },
      user,
      '1.2.3.4',
    );

    const data = prisma.transaction.create.mock.calls[0][0].data;
    expect(data.type).toBe('EXPENSE');
    expect(data.referenceType).toBe('WITHDRAWAL');
    expect(data.referenceId).toBe(1);
    expect(data.amount.toString()).toBe('30000');
    // saldo = 100000 + 50000 - 20000 = 130000 ; nuevo = 100000
    expect(res.new_balance).toBe('100000.00');
    expect(res.transaction_id).toBe(99);
    expect(res.registered_by).toBe('admin_test');
  });

  it('withdraw: caja cerrada -> BadRequest', async () => {
    prisma.cashRegister.findUnique.mockResolvedValue({ ...openReg, status: 'CLOSED' });
    await expect(
      service.withdraw(1, { amount: '1', concept: 'x' }, user, null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('withdraw: concepto vacio -> BadRequest', async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(openReg);
    await expect(
      service.withdraw(1, { amount: '1', concept: '   ' }, user, null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('withdraw: monto supera el saldo -> BadRequest', async () => {
    prisma.cashRegister.findUnique.mockResolvedValue(openReg);
    await expect(
      service.withdraw(1, { amount: '999999', concept: 'x' }, user, null),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});

describe('ExpensesService', () => {
  let prisma: any;
  let tx: any;
  let service: ExpensesService;

  beforeEach(() => {
    tx = {
      expense: {
        create: jest.fn().mockResolvedValue({
          id: 1,
          description: 'Luz',
          categoryId: 2,
        }),
        update: jest.fn(),
      },
      transaction: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      expenseCategory: { findUnique: jest.fn() },
      expense: { findUnique: jest.fn() },
    };
    service = new ExpensesService(prisma, audit as any);
    jest.clearAllMocks();
  });

  it('create: crea gasto y Transaction EXPENSE con concepto correcto', async () => {
    prisma.expenseCategory.findUnique.mockResolvedValue({ id: 2, name: 'Servicios' });
    prisma.expense.findUnique.mockResolvedValue({
      id: 1,
      description: 'Luz',
      categoryId: 2,
      category: { name: 'Servicios' },
      amount: D('80000.00'),
      expenseDate: new Date('2026-06-15'),
      paymentMethod: 'CASH',
      receiptReference: '',
      notes: '',
      registeredById: 7,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.create(
      {
        description: 'Luz',
        category: 2,
        amount: '80000',
        expense_date: '2026-06-15',
        payment_method: 'CASH',
      } as any,
      { userId: 7, ip: null },
    );

    const data = tx.transaction.create.mock.calls[0][0].data;
    expect(data.type).toBe('EXPENSE');
    expect(data.referenceType).toBe('EXPENSE');
    expect(data.referenceId).toBe(1);
    expect(data.amount.toString()).toBe('80000');
    expect(data.concept).toBe('Gasto #1 — Luz [Servicios]');
  });

  it('create: monto <= 0 -> BadRequest', async () => {
    await expect(
      service.create(
        {
          description: 'x',
          category: 2,
          amount: '0',
          expense_date: '2026-06-15',
          payment_method: 'CASH',
        } as any,
        { userId: 7, ip: null },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
