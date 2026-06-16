import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmployeesService } from './employees.service';
import { PayrollsService } from './payrolls.service';
import { WorkSchedulesService } from './work-schedules.service';

const D = (v: string) => new Prisma.Decimal(v);
const audit = { record: jest.fn(), diff: jest.fn().mockReturnValue({}) };
const crypto = { encrypt: (v: string) => `enc(${v})`, decrypt: (v: string) => v };
const ADMIN = { id: 7, username: 'admin', role: 'ADMIN' as const };

describe('EmployeesService', () => {
  let prisma: any;
  let tx: any;
  let service: EmployeesService;

  beforeEach(() => {
    tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 20 }) },
      employee: { create: jest.fn().mockResolvedValue({ id: 5 }) },
    };
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      employee: { findUnique: jest.fn() },
    };
    service = new EmployeesService(prisma, audit as any, crypto as any);
    jest.clearAllMocks();
  });

  it('create: crea User (EMPLEADO, password hasheada) + Employee con documento cifrado', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 5,
      userId: 20,
      user: { username: 'jperez' },
      fullName: 'Juan Pérez',
      documentType: 'CC',
      documentNumber: 'enc(123)',
      position: 'Vendedor',
      hireDate: new Date('2026-01-01'),
      baseSalary: D('1500000.00'),
      phone: '300',
      isActive: true,
    });

    await service.create(
      {
        username: 'jperez',
        password: 'Secret123',
        full_name: 'Juan Pérez',
        document_type: 'CC',
        document_number: '123',
        position: 'Vendedor',
        hire_date: '2026-01-01',
        base_salary: '1500000',
      } as any,
      { userId: 7, ip: null },
    );

    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.role).toBe('EMPLEADO');
    expect(userData.password.startsWith('pbkdf2_sha256$')).toBe(true);

    const empData = tx.employee.create.mock.calls[0][0].data;
    expect(empData.userId).toBe(20);
    expect(empData.documentNumber).toBe('enc(123)');
  });
});

describe('PayrollsService.approve', () => {
  let prisma: any;
  let tx: any;
  let service: PayrollsService;

  beforeEach(() => {
    tx = {
      payroll: {
        update: jest.fn().mockResolvedValue({
          id: 3,
          status: 'APPROVED',
          totalAmount: D('5000000.00'),
          periodStart: new Date('2026-06-01'),
          periodEnd: new Date('2026-06-15'),
          generatedById: 7,
        }),
      },
      transaction: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      payroll: { findUnique: jest.fn() },
    };
    service = new PayrollsService(prisma, audit as any);
    jest.clearAllMocks();
  });

  it('DRAFT -> APPROVED crea Transaction EXPENSE/PAYROLL', async () => {
    prisma.payroll.findUnique
      .mockResolvedValueOnce({ id: 3, status: 'DRAFT' }) // guard
      .mockResolvedValueOnce({
        id: 3,
        status: 'APPROVED',
        periodStart: new Date('2026-06-01'),
        periodEnd: new Date('2026-06-15'),
        totalAmount: D('5000000.00'),
        generatedById: 7,
        items: [],
        createdAt: new Date(),
      });

    await service.approve(3);

    const data = tx.transaction.create.mock.calls[0][0].data;
    expect(data.type).toBe('EXPENSE');
    expect(data.referenceType).toBe('PAYROLL');
    expect(data.referenceId).toBe(3);
    expect(data.amount.toString()).toBe('5000000');
  });

  it('ya aprobada -> BadRequest', async () => {
    prisma.payroll.findUnique.mockResolvedValueOnce({ id: 3, status: 'APPROVED' });
    await expect(service.approve(3)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ya pagada -> BadRequest', async () => {
    prisma.payroll.findUnique.mockResolvedValueOnce({ id: 3, status: 'PAID' });
    await expect(service.approve(3)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WorkSchedulesService validaciones', () => {
  let prisma: any;
  let tx: any;
  let service: WorkSchedulesService;

  beforeEach(() => {
    tx = {
      workSchedule: { create: jest.fn().mockResolvedValue({ id: 9 }) },
      workShift: { createMany: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      workSchedule: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    service = new WorkSchedulesService(prisma, audit as any);
    jest.clearAllMocks();
  });

  const MONDAY = '2024-01-01'; // lunes
  const TUESDAY = '2024-01-02';

  it('week_start que no es lunes -> BadRequest', async () => {
    await expect(
      service.create(
        { employee: 1, week_start: TUESDAY, shifts: [{ day_of_week: 1, start_time: '08:00', end_time: '17:00' }] } as any,
        { userId: 7, ip: null },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dias duplicados -> BadRequest', async () => {
    await expect(
      service.create(
        {
          employee: 1,
          week_start: MONDAY,
          shifts: [
            { day_of_week: 1, start_time: '08:00', end_time: '12:00' },
            { day_of_week: 1, start_time: '13:00', end_time: '17:00' },
          ],
        } as any,
        { userId: 7, ip: null },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hora salida <= entrada -> BadRequest', async () => {
    await expect(
      service.create(
        { employee: 1, week_start: MONDAY, shifts: [{ day_of_week: 1, start_time: '17:00', end_time: '08:00' }] } as any,
        { userId: 7, ip: null },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('valido -> crea horario y turnos', async () => {
    prisma.workSchedule.findUnique.mockResolvedValue({
      id: 9,
      employeeId: 1,
      employee: { fullName: 'Juan', userId: 20 },
      weekStart: new Date(`${MONDAY}T00:00:00Z`),
      notes: '',
      createdById: 7,
      createdBy: { username: 'admin' },
      createdAt: new Date(),
      updatedAt: new Date(),
      shifts: [],
    });

    await service.create(
      { employee: 1, week_start: MONDAY, shifts: [{ day_of_week: 1, start_time: '08:00', end_time: '17:00' }] } as any,
      { userId: 7, ip: null },
    );
    expect(tx.workShift.createMany).toHaveBeenCalled();
    expect(tx.workShift.createMany.mock.calls[0][0].data[0].dayOfWeek).toBe(1);
  });

  it('copy-to-next-week: ya existe -> BadRequest', async () => {
    prisma.workSchedule.findUnique.mockResolvedValue({
      id: 9,
      employeeId: 1,
      weekStart: new Date(`${MONDAY}T00:00:00Z`),
      notes: '',
      shifts: [],
    });
    prisma.workSchedule.findFirst.mockResolvedValue({ id: 99 }); // ya existe
    await expect(
      service.copyToNextWeek(9, { userId: 7, ip: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
