import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreditNoteItemInput {
  @IsInt()
  sale_item: number;

  @IsInt()
  @Min(1, { message: 'La cantidad devuelta debe ser al menos 1.' })
  quantity_returned: number;
}

export class CreateCreditNoteDto {
  @IsInt()
  sale: number;

  @IsString()
  reason: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un ítem para devolver.' })
  @ValidateNested({ each: true })
  @Type(() => CreditNoteItemInput)
  items: CreditNoteItemInput[];
}
