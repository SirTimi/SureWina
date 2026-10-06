import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class PromotionalJackpotPaystackPurchaseDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{2,4}$/, {
    message: 'stateOfPlayCode must be 2-4 uppercase letters',
  })
  stateOfPlayCode!: string;

  @IsOptional()
  @IsEmail({}, {
    message: 'buyerEmail must be a valid email address',
  })
  buyerEmail?: string;
}
