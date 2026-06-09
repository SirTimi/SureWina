import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'otp must be a 6 digit code',
  })
  otp!: string;
}