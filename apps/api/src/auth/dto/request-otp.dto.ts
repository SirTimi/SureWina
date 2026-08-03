import { IsEmail, IsOptional, Matches, ValidateIf } from 'class-validator';

// Either credential gets you in, but never neither. Email is a second route
// to an existing account, not a way to create one: identity stays anchored
// to the phone, because that's how a winner gets notified and paid.
export class RequestOtpDto {
  @ValidateIf((o: RequestOtpDto) => !o.email)
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'Enter a valid phone number, or use your email address instead',
  })
  phoneE164?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;
}