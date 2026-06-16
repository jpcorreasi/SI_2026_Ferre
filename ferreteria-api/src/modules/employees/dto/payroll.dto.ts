import {
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
} from 'class-validator';
import { PayrollStatus } from '@prisma/client';

export class CreatePayrollDto {
  @IsDateString({}, { message: 'period_start debe ser una fecha (YYYY-MM-DD).' })
  period_start: string;

  @IsDateString({}, { message: 'period_end debe ser una fecha (YYYY-MM-DD).' })
  period_end: string;

  @IsNumberString({}, { message: 'total_amount debe ser un numero.' })
  total_amount: string;

  @IsOptional()
  @IsEnum(PayrollStatus)
  status?: PayrollStatus;
}

export class UpdatePayrollDto {
  @IsOptional()
  @IsDateString({}, { message: 'period_start debe ser una fecha (YYYY-MM-DD).' })
  period_start?: string;

  @IsOptional()
  @IsDateString({}, { message: 'period_end debe ser una fecha (YYYY-MM-DD).' })
  period_end?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'total_amount debe ser un numero.' })
  total_amount?: string;

  @IsOptional()
  @IsEnum(PayrollStatus)
  status?: PayrollStatus;
}
