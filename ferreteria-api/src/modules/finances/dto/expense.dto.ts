import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ExpensePaymentMethod } from '@prisma/client';

export class CreateExpenseCategoryDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateExpenseCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateExpenseDto {
  @IsString()
  @MaxLength(255)
  description: string;

  @IsInt()
  category: number;

  @IsNumberString({}, { message: 'amount debe ser un numero.' })
  amount: string;

  @IsDateString({}, { message: 'expense_date debe ser una fecha (YYYY-MM-DD).' })
  expense_date: string;

  @IsEnum(ExpensePaymentMethod)
  payment_method: ExpensePaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  receipt_reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsInt()
  category?: number;

  @IsOptional()
  @IsNumberString({}, { message: 'amount debe ser un numero.' })
  amount?: string;

  @IsOptional()
  @IsDateString({}, { message: 'expense_date debe ser una fecha (YYYY-MM-DD).' })
  expense_date?: string;

  @IsOptional()
  @IsEnum(ExpensePaymentMethod)
  payment_method?: ExpensePaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  receipt_reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
