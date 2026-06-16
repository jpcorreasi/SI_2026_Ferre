import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class WorkShiftInput {
  @IsInt()
  @Min(1)
  @Max(7)
  day_of_week: number;

  @Matches(TIME_RE, { message: 'start_time debe tener formato HH:MM[:SS].' })
  start_time: string;

  @Matches(TIME_RE, { message: 'end_time debe tener formato HH:MM[:SS].' })
  end_time: string;
}

export class CreateWorkScheduleDto {
  @IsInt()
  employee: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'week_start debe ser una fecha (YYYY-MM-DD).',
  })
  week_start: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'El horario debe incluir al menos un turno.' })
  @ValidateNested({ each: true })
  @Type(() => WorkShiftInput)
  shifts: WorkShiftInput[];
}

export class UpdateWorkScheduleDto {
  @IsOptional()
  @IsInt()
  employee?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'week_start debe ser una fecha (YYYY-MM-DD).',
  })
  week_start?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'El horario debe incluir al menos un turno.' })
  @ValidateNested({ each: true })
  @Type(() => WorkShiftInput)
  shifts?: WorkShiftInput[];
}
