import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseOrderStatus } from '@prisma/client';

export class PurchaseOrderItemInput {
  @IsInt()
  product: number;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1.' })
  quantity: number;

  @IsNumberString({}, { message: 'unit_cost debe ser un numero.' })
  unit_cost: string;
}

export class CreatePurchaseOrderDto {
  @IsInt()
  supplier: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto.' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInput)
  items: PurchaseOrderItemInput[];
}

/** Update via PurchaseOrderSerializer: supplier/status/notes (items read-only). */
export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsInt()
  supplier?: number;

  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
