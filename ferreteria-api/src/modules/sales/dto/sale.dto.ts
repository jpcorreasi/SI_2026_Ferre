import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class SaleItemInput {
  @IsInt()
  product: number;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1.' })
  quantity: number;
}

export class CreateSaleDto {
  @IsOptional()
  @ValidateIf((o) => o.customer !== null)
  @IsInt()
  customer?: number | null;

  @IsInt()
  payment_method: number;

  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean;

  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un ítem.' })
  @ValidateNested({ each: true })
  @Type(() => SaleItemInput)
  items: SaleItemInput[];
}

export class UpdateSaleDto {
  @IsOptional()
  @ValidateIf((o) => o.customer !== null)
  @IsInt()
  customer?: number | null;

  @IsOptional()
  @IsInt()
  payment_method?: number;

  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean;

  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un ítem.' })
  @ValidateNested({ each: true })
  @Type(() => SaleItemInput)
  items: SaleItemInput[];
}
