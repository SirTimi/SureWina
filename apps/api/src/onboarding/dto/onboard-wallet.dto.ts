import { Equals, IsBoolean, IsString, Length, Matches } from 'class-validator';

export class OnboardWalletDto {
  @IsString()
  @Length(2, 50)
  firstName!: string;

  @IsString()
  @Length(2, 50)
  lastName!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateOfBirth must use YYYY-MM-DD',
  })
  dateOfBirth!: string;

  @Matches(/^\d{11}$/, { message: 'bvn must be exactly 11 digits' })
  bvn!: string;

  // The customer's own acceptance of the wallet terms. Must be an explicit
  // true — a missing or false value is not consent.
  @IsBoolean()
  @Equals(true, { message: 'You must accept the wallet terms to continue' })
  acceptTerms!: boolean;
}