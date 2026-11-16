import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class AddWithdrawalAccountDto {
  @Matches(/^\d{3,10}$/, { message: 'bankCode must be 3 to 10 digits' })
  bankCode!: string;

  @Matches(/^\d{10}$/, { message: 'accountNumber must be exactly 10 digits' })
  accountNumber!: string;

  // Checked against the BVN the wallet was verified with, then sent to
  // Monnify for the account match. Never stored or logged.
  @Matches(/^\d{11}$/, { message: 'bvn must be exactly 11 digits' })
  bvn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  bankName?: string;

  // The owner's withdrawal PIN. Checked, never stored or passed on.
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'pin must be exactly 4 digits' })
  pin?: string;
}

export class RequestWithdrawalDto {
  @IsUUID()
  withdrawalAccountId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountNgn!: number;

  // The client's own key for this withdrawal; sending it again returns the
  // same withdrawal instead of making a second one.
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, {
    message: 'requestId must be 8-64 letters, digits, hyphens or underscores',
  })
  requestId!: string;

  // The owner's withdrawal PIN. Checked, never stored or passed on.
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'pin must be exactly 4 digits' })
  pin?: string;
}

export class SetWalletPinDto {
  @Matches(/^\d{4}$/, { message: 'pin must be exactly 4 digits' })
  pin!: string;
}

export class ChangeWalletPinDto {
  @Matches(/^\d{4}$/, { message: 'currentPin must be exactly 4 digits' })
  currentPin!: string;

  @Matches(/^\d{4}$/, { message: 'newPin must be exactly 4 digits' })
  newPin!: string;
}

export class ResetWalletPinDto {
  @Matches(/^\d{11}$/, { message: 'bvn must be exactly 11 digits' })
  bvn!: string;

  @Matches(/^\d{4}$/, { message: 'newPin must be exactly 4 digits' })
  newPin!: string;
}
