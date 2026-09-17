import { IsEmail, IsInt, IsOptional, Min } from 'class-validator';

export class InitiateWalletFundingDto {
  @IsInt()
  @Min(1)
  amountNgn!: number;

  @IsOptional()
  @IsEmail()
  email?: string;
}