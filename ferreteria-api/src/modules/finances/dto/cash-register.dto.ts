import {
  IsEnum,
  IsNumberString,
  IsOptional,
} from 'class-validator';
import { CashRegisterStatus } from '@prisma/client';

export class CreateCashRegisterDto {
  @IsNumberString({}, { message: 'opening_amount debe ser un numero.' })
  opening_amount: string;
}

export class UpdateCashRegisterDto {
  @IsOptional()
  @IsNumberString({}, { message: 'opening_amount debe ser un numero.' })
  opening_amount?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'closing_amount debe ser un numero.' })
  closing_amount?: string;

  @IsOptional()
  @IsEnum(CashRegisterStatus)
  status?: CashRegisterStatus;
}

// close/withdraw se parsean manualmente en el service para reproducir
// exactamente los mensajes de error de Django (a nivel detail/campo).
