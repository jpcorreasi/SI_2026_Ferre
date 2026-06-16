import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';
import { TransactionType, TransactionReferenceType } from '@prisma/client';

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsNumberString({}, { message: 'amount debe ser un numero.' })
  amount: string;

  @IsString()
  concept: string;

  @IsEnum(TransactionReferenceType)
  reference_type: TransactionReferenceType;

  @IsInt()
  reference_id: number;

  @IsDateString({}, { message: 'transaction_date debe ser una fecha (YYYY-MM-DD).' })
  transaction_date: string;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsNumberString({}, { message: 'amount debe ser un numero.' })
  amount?: string;

  @IsOptional()
  @IsString()
  concept?: string;

  @IsOptional()
  @IsEnum(TransactionReferenceType)
  reference_type?: TransactionReferenceType;

  @IsOptional()
  @IsInt()
  reference_id?: number;

  @IsOptional()
  @IsDateString({}, { message: 'transaction_date debe ser una fecha (YYYY-MM-DD).' })
  transaction_date?: string;
}
