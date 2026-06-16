import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { SupplierInvoicePaymentStatus } from '@prisma/client';

export class SupplierInvoiceItemInput {
  @IsInt()
  product: number;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1.' })
  quantity: number;

  @IsNumberString({}, { message: 'unit_cost debe ser un numero.' })
  unit_cost: string;
}

export class CreateSupplierInvoiceDto {
  @IsString()
  supplier_invoice_number: string;

  @IsInt()
  supplier: number;

  @IsOptional()
  @ValidateIf((o) => o.purchase_order !== null)
  @IsInt()
  purchase_order?: number | null;

  @IsDateString({}, { message: 'received_at debe ser una fecha (YYYY-MM-DD).' })
  received_at: string;

  @IsOptional()
  @IsEnum(SupplierInvoicePaymentStatus)
  payment_status?: SupplierInvoicePaymentStatus;

  @IsOptional()
  @IsNumberString({}, { message: 'tax debe ser un numero.' })
  tax?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto.' })
  @ValidateNested({ each: true })
  @Type(() => SupplierInvoiceItemInput)
  items: SupplierInvoiceItemInput[];
}

export class UpdateSupplierInvoiceDto {
  @IsOptional()
  @IsString()
  supplier_invoice_number?: string;

  @IsOptional()
  @IsInt()
  supplier?: number;

  @IsOptional()
  @ValidateIf((o) => o.purchase_order !== null)
  @IsInt()
  purchase_order?: number | null;

  @IsOptional()
  @IsDateString({}, { message: 'received_at debe ser una fecha (YYYY-MM-DD).' })
  received_at?: string;

  @IsOptional()
  @IsEnum(SupplierInvoicePaymentStatus)
  payment_status?: SupplierInvoicePaymentStatus;

  @IsOptional()
  @IsNumberString({}, { message: 'tax debe ser un numero.' })
  tax?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto.' })
  @ValidateNested({ each: true })
  @Type(() => SupplierInvoiceItemInput)
  items?: SupplierInvoiceItemInput[];

  @IsOptional()
  @IsBoolean()
  force_update?: boolean;
}
