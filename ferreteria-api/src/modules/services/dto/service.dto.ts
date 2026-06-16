import {
  IsDateString,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateServiceTypeDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'default_price debe ser un numero.' })
  default_price?: string;
}

export class UpdateServiceTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'default_price debe ser un numero.' })
  default_price?: string;
}

export class CreateServiceDto {
  @IsInt()
  service_type: number;

  @IsString()
  @MaxLength(255)
  description: string;

  @IsNumberString({}, { message: 'price debe ser un numero.' })
  price: string;

  @IsOptional()
  @ValidateIf((o) => o.customer !== null)
  @IsInt()
  customer?: number | null;

  @IsInt()
  performed_by: number;

  @IsDateString({}, { message: 'service_date debe ser una fecha (YYYY-MM-DD).' })
  service_date: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateServiceDto {
  @IsOptional()
  @IsInt()
  service_type?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'price debe ser un numero.' })
  price?: string;

  @IsOptional()
  @ValidateIf((o) => o.customer !== null)
  @IsInt()
  customer?: number | null;

  @IsOptional()
  @IsInt()
  performed_by?: number;

  @IsOptional()
  @IsDateString({}, { message: 'service_date debe ser una fecha (YYYY-MM-DD).' })
  service_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
