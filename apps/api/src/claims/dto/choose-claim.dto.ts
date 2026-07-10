import { IsEnum } from 'class-validator';
import { ClaimType } from '@prisma/client';

export class ChooseClaimDto {
  @IsEnum(ClaimType)
  path!: ClaimType;
}