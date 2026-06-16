import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { PayrollsController } from './payrolls.controller';
import { PayrollsService } from './payrolls.service';
import { WorkSchedulesController } from './work-schedules.controller';
import { WorkSchedulesService } from './work-schedules.service';

@Module({
  controllers: [
    EmployeesController,
    PayrollsController,
    WorkSchedulesController,
  ],
  providers: [EmployeesService, PayrollsService, WorkSchedulesService],
})
export class EmployeesModule {}
