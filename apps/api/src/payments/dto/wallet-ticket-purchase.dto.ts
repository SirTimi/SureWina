import {
  IsInt,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class WalletTicketPurchaseDto {
  @IsString()
  @Length(1, 100)
  drawCode!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;

  @IsString()
  @Length(2, 32)
  stateOfPlayCode!: string;

  @IsString()
  @Length(16, 200)
  idempotencyKey!: string;
}