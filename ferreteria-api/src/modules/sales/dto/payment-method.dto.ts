import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString()
  @MaxLength(50)
  name: string;
}

export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;
}
