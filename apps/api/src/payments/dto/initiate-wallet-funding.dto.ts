import { IsEmail, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class InitiateWalletFundingDto {
  @IsIn(['MONNIFY', 'FLUTTERWAVE'])
  gateway!: 'MONNIFY' | 'FLUTTERWAVE';

  @IsInt()
  @Min(1)
  amountNgn!: number;

  @IsOptional()
  @IsEmail()
  email?: string;
}