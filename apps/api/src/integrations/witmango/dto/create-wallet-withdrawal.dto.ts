
import {
  IsInt,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateWalletWithdrawalDto {
  @IsUUID()
  requestId!: string;

  @IsInt()
  @Min(100)
  @Max(500000)
  amountNgn!: number;
}
