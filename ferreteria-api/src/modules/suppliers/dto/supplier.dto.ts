import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MaxLength(255)
  business_name: string;

  @IsString()
  @MaxLength(20)
  nit: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contact_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  business_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  nit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contact_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
