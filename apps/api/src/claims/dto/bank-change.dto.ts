
import {
  IsString,
  Matches,
} from 'class-validator';

export class RequestBankChangeDto {
  @IsString()
  @Matches(/^\d{3,6}$/)
  bankCode!: string;

  @IsString()
  @Matches(/^\d{10}$/)
  accountNumber!: string;
}

export class VerifyBankChangeDto {
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/i)
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}
