import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DocumentType } from '@prisma/client';

export class CreateEmployeeDto {
  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsString()
  @MaxLength(255)
  full_name: string;

  @IsEnum(DocumentType)
  document_type: DocumentType;

  @IsString()
  @MaxLength(20)
  document_number: string;

  @IsString()
  @MaxLength(100)
  position: string;

  @IsDateString({}, { message: 'hire_date debe ser una fecha (YYYY-MM-DD).' })
  hire_date: string;

  @IsNumberString({}, { message: 'base_salary debe ser un numero.' })
  base_salary: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  full_name?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  document_type?: DocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  document_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  @IsOptional()
  @IsDateString({}, { message: 'hire_date debe ser una fecha (YYYY-MM-DD).' })
  hire_date?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'base_salary debe ser un numero.' })
  base_salary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
