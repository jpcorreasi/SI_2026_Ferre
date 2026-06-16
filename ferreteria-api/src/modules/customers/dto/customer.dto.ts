import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DocumentType } from '@prisma/client';

export class CreateCustomerDto {
  @IsString()
  @MaxLength(255)
  full_name: string;

  @IsEnum(DocumentType)
  document_type: DocumentType;

  @IsString()
  @MaxLength(20)
  document_number: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateCustomerDto {
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
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
