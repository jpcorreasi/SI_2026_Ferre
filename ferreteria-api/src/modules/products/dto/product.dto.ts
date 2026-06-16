import {
  IsBoolean,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(50)
  code: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  category: number;

  @IsNumberString({}, { message: 'sale_price debe ser un numero.' })
  sale_price: string;

  @IsOptional()
  @IsNumberString({}, { message: 'cost_price debe ser un numero.' })
  cost_price?: string;

  @IsOptional()
  @IsInt()
  stock?: number;

  @IsOptional()
  @IsInt()
  min_stock?: number;

  @IsOptional()
  @ValidateIf((o) => o.supplier !== null)
  @IsInt()
  supplier?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  category?: number;

  @IsOptional()
  @IsNumberString({}, { message: 'sale_price debe ser un numero.' })
  sale_price?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'cost_price debe ser un numero.' })
  cost_price?: string;

  @IsOptional()
  @IsInt()
  stock?: number;

  @IsOptional()
  @IsInt()
  min_stock?: number;

  @IsOptional()
  @ValidateIf((o) => o.supplier !== null)
  @IsInt()
  supplier?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
