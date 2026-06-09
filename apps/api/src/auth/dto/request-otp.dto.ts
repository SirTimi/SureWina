import { IsNotEmpty, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneE164 must be a valid E.164 phone number',
  })
  phoneE164!: string;
}