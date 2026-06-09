import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  mfaCode?: string;
}