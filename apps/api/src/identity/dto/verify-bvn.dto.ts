import { IsString, Length, Matches } from 'class-validator';

export class VerifyBvnDto {
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
}