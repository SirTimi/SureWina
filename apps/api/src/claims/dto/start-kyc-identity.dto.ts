import { Equals, IsBoolean, IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class StartKycIdentityDto {
  @IsBoolean()
  @Equals(true, { message: 'Explicit identity verification consent is required' })
  consent!: boolean;

  @IsString()
  @Matches(/^\d{11}$/, { message: 'BVN must contain exactly 11 digits' })
  bvn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(/^\d{3,6}$/)
  bankCode!: string;

  @IsString()
  @Matches(/^\d{10}$/)
  accountNumber!: string;
}
