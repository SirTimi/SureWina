import { IsOptional, IsEnum } from "class-validator";
import {RemittanceStatus} from '@prisma/client'

export class ListRemittancesQueryDto {
  @IsOptional()
  @IsEnum(RemittanceStatus)
  status?: RemittanceStatus;
}