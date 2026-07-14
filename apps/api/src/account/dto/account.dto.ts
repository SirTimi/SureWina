import {
  IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString,
  Matches, MaxLength, Min,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(60)
  displayName?: string | null;

  @IsOptional() @IsEmail()
  email?: string | null;
}

export class UpdateNotificationsDto {
  @IsOptional() @IsBoolean() sms?: boolean;
  @IsOptional() @IsBoolean() push?: boolean;
  @IsOptional() @IsBoolean() email?: boolean;
}

export class SetSpendLimitDto {
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  period!: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @IsInt() @Min(500)
  capNgn!: number;
}

export class TakeBreakDto {
  // Responsible-play pause, user-irreversible. 1–90 days.
  @IsInt() @Min(1)
  days!: number;
}

export class SetBankDto {
  @IsString() @Matches(/^\d{10}$/)
  accountNumber!: string;

  @IsString() @Matches(/^\d{3,6}$/)
  bankCode!: string;
}