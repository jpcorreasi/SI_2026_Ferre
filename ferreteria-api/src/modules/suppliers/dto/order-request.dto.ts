import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderRequestStatus } from '@prisma/client';

export class OrderRequestItemInput {
  @IsInt()
  product: number;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1.' })
  quantity_requested: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderRequestDto {
  @IsInt()
  supplier: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto.' })
  @ValidateNested({ each: true })
  @Type(() => OrderRequestItemInput)
  items: OrderRequestItemInput[];
}

/** Update via OrderRequestSerializer: supplier/status/notes (items read-only). */
export class UpdateOrderRequestDto {
  @IsOptional()
  @IsInt()
  supplier?: number;

  @IsOptional()
  @IsEnum(OrderRequestStatus)
  status?: OrderRequestStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
