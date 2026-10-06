import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class PromotionalJackpotWalletPurchaseDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{2,4}$/, {
    message: 'stateOfPlayCode must be 2-4 uppercase letters',
  })
  stateOfPlayCode!: string;

  @IsString()
  @Length(16, 200)
  idempotencyKey!: string;
}
