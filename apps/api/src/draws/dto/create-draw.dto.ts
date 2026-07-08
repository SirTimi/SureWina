import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DrawType } from '@prisma/client';

export class CreateDrawDto {
  @IsEnum(DrawType)
  drawType!: DrawType;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  prizeDescription!: string;

  @IsInt()
  @IsPositive()
  prizeValueNgn!: number;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  prizeImageUrl?: string;

  @IsInt()
  @IsPositive()
  ticketPriceNgn!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  ticketQuota?: number;

  // ISO 8601 timestamps, e.g. "2026-07-10T20:00:00.000Z"
  @IsISO8601()
  scheduledAt!: string;

  @IsISO8601()
  cutoffAt!: string;
}