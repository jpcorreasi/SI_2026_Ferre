import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditActor } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { dt, dateOnly } from '../../common/serialization/format';
import { listPaginated } from '../../common/crud/list.helper';
import { parseDateOnly, parseTime, formatTime } from '../../common/utils/dates';
import {
  CreateWorkScheduleDto,
  UpdateWorkScheduleDto,
  WorkShiftInput,
} from './dto/work-schedule.dto';

const APP = 'employees';
const MODEL = 'workschedule';

const DAY_LABEL: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

const INCLUDE = {
  employee: true,
  createdBy: true,
  shifts: { orderBy: { dayOfWeek: 'asc' } },
} as const;

@Injectable()
export class WorkSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(s: any) {
    return {
      id: s.id,
      employee: s.employeeId,
      employee_name: s.employee?.fullName ?? null,
      week_start: dateOnly(s.weekStart),
      notes: s.notes,
      created_by: s.createdById,
      created_by_username: s.createdBy?.username ?? null,
      created_at: dt(s.createdAt),
      updated_at: dt(s.updatedAt),
      shifts: (s.shifts ?? []).map((sh: any) => ({
        id: sh.id,
        day_of_week: sh.dayOfWeek,
        day_of_week_label: DAY_LABEL[sh.dayOfWeek] ?? String(sh.dayOfWeek),
        start_time: formatTime(sh.startTime),
        end_time: formatTime(sh.endTime),
      })),
    };
  }

  private getFull(id: number) {
    return this.prisma.workSchedule.findUnique({ where: { id }, include: INCLUDE });
  }

  list(req: Request, user: AuthUser) {
    const baseWhere =
      user.role === 'ADMIN' ? {} : { employee: { userId: user.id } };
    return listPaginated(
      req,
      this.prisma.workSchedule,
      {
        orderingFields: [
          { param: 'week_start', field: 'weekStart' },
          { param: 'employee__full_name', field: 'employee.fullName' },
        ],
        defaultOrdering: [{ weekStart: 'desc' }],
      },
      (s) => this.view(s),
      { include: INCLUDE, baseWhere },
    );
  }

  async retrieve(id: number, user: AuthUser) {
    const s = await this.getFull(id);
    if (!s) throw new NotFoundException({ detail: 'No encontrado.' });
    if (user.role !== 'ADMIN' && s.employee?.userId !== user.id)
      throw new NotFoundException({ detail: 'No encontrado.' });
    return this.view(s);
  }

  private validateShifts(shifts: WorkShiftInput[]) {
    const days = shifts.map((s) => s.day_of_week);
    if (new Set(days).size !== days.length)
      throw new BadRequestException({
        shifts: ['No puede haber dos turnos para el mismo día.'],
      });
    for (const s of shifts) {
      const start = s.start_time.length === 5 ? `${s.start_time}:00` : s.start_time;
      const end = s.end_time.length === 5 ? `${s.end_time}:00` : s.end_time;
      if (end <= start)
        throw new BadRequestException({
          end_time: ['La hora de salida debe ser posterior a la hora de entrada.'],
        });
    }
  }

  private assertMonday(weekStart: string) {
    if (parseDateOnly(weekStart).getUTCDay() !== 1)
      throw new BadRequestException({
        week_start: ['La fecha de inicio de semana debe ser un lunes.'],
      });
  }

  async create(dto: CreateWorkScheduleDto, actor: AuditActor) {
    this.assertMonday(dto.week_start);
    this.validateShifts(dto.shifts);

    const id = await this.prisma.$transaction(async (tx) => {
      const schedule = await tx.workSchedule.create({
        data: {
          employeeId: dto.employee,
          weekStart: parseDateOnly(dto.week_start),
          notes: dto.notes ?? '',
          createdById: actor.userId!,
        },
      });
      await tx.workShift.createMany({
        data: dto.shifts.map((s) => ({
          scheduleId: schedule.id,
          dayOfWeek: s.day_of_week,
          startTime: parseTime(s.start_time),
          endTime: parseTime(s.end_time),
        })),
      });
      return schedule.id;
    });

    await this.audit.record({
      actor,
      action: 'CREATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Horario #${id}`,
    });
    return this.retrieve(id, { id: actor.userId!, username: '', role: 'ADMIN' });
  }

  async update(id: number, dto: UpdateWorkScheduleDto, actor: AuditActor) {
    const before = await this.prisma.workSchedule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ detail: 'No encontrado.' });
    if (dto.week_start !== undefined) this.assertMonday(dto.week_start);
    if (dto.shifts !== undefined) this.validateShifts(dto.shifts);

    await this.prisma.$transaction(async (tx) => {
      const data: Record<string, any> = {};
      if (dto.employee !== undefined) data.employeeId = dto.employee;
      if (dto.week_start !== undefined)
        data.weekStart = parseDateOnly(dto.week_start);
      if (dto.notes !== undefined) data.notes = dto.notes;
      await tx.workSchedule.update({ where: { id }, data });

      if (dto.shifts !== undefined) {
        await tx.workShift.deleteMany({ where: { scheduleId: id } });
        await tx.workShift.createMany({
          data: dto.shifts.map((s) => ({
            scheduleId: id,
            dayOfWeek: s.day_of_week,
            startTime: parseTime(s.start_time),
            endTime: parseTime(s.end_time),
          })),
        });
      }
    });

    await this.audit.record({
      actor,
      action: 'UPDATE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Horario #${id}`,
    });
    return this.retrieve(id, { id: actor.userId!, username: '', role: 'ADMIN' });
  }

  /** POST /work-schedules/{id}/copy-to-next-week/ */
  async copyToNextWeek(id: number, actor: AuditActor) {
    const source = await this.getFull(id);
    if (!source) throw new NotFoundException({ detail: 'No encontrado.' });

    const nextMonday = new Date(source.weekStart.getTime() + 7 * 86400000);
    const ymd = nextMonday.toISOString().slice(0, 10);

    const exists = await this.prisma.workSchedule.findFirst({
      where: { employeeId: source.employeeId, weekStart: nextMonday },
    });
    if (exists)
      throw new BadRequestException({
        detail: `Ya existe un horario para la semana del ${ymd}.`,
      });

    const newId = await this.prisma.$transaction(async (tx) => {
      const schedule = await tx.workSchedule.create({
        data: {
          employeeId: source.employeeId,
          weekStart: nextMonday,
          notes: source.notes,
          createdById: actor.userId!,
        },
      });
      await tx.workShift.createMany({
        data: source.shifts.map((sh: any) => ({
          scheduleId: schedule.id,
          dayOfWeek: sh.dayOfWeek,
          startTime: sh.startTime,
          endTime: sh.endTime,
        })),
      });
      return schedule.id;
    });

    return this.retrieve(newId, { id: actor.userId!, username: '', role: 'ADMIN' });
  }

  async remove(id: number, actor: AuditActor) {
    const s = await this.prisma.workSchedule.findUnique({ where: { id } });
    if (!s) throw new NotFoundException({ detail: 'No encontrado.' });
    await this.audit.record({
      actor,
      action: 'DELETE',
      appLabel: APP,
      modelName: MODEL,
      objectId: id,
      objectRepr: `Horario #${id}`,
    });
    await this.prisma.workSchedule.delete({ where: { id } });
  }
}
