import { IsString, Matches } from 'class-validator';

export class SubmitBvnDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: 'BVN must be exactly 11 digits' })
  bvn!: string;
}

export class SubmitBankDto {
  @IsString()
  @Matches(/^\d{10}$/, { message: 'accountNumber must be a 10-digit NUBAN' })
  accountNumber!: string;

  @IsString()
  @Matches(/^\d{3,6}$/, { message: 'bankCode must be a numeric bank code' })
  bankCode!: string;
}