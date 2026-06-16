import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { CustomerInvoiceStatus } from '@prisma/client';

export class CreateCustomerInvoiceDto {
  @IsInt()
  sale: number;

  @IsOptional()
  @ValidateIf((o) => o.customer !== null)
  @IsInt()
  customer?: number | null;

  @IsOptional()
  @IsNumberString({}, { message: 'tax debe ser un numero.' })
  tax?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'discount debe ser un numero.' })
  discount?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(CustomerInvoiceStatus)
  status?: CustomerInvoiceStatus;
}

export class UpdateCustomerInvoiceDto {
  @IsOptional()
  @ValidateIf((o) => o.customer !== null)
  @IsInt()
  customer?: number | null;

  @IsOptional()
  @IsNumberString({}, { message: 'tax debe ser un numero.' })
  tax?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'discount debe ser un numero.' })
  discount?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(CustomerInvoiceStatus)
  status?: CustomerInvoiceStatus;

  @IsOptional()
  @IsBoolean()
  force_update?: boolean;
}

export class SendInvoiceEmailDto {
  @IsOptional()
  @IsString()
  recipient_email?: string;
}
