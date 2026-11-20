import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DrawPrizeModel, DrawType, PoolRevenueBasis } from '@prisma/client';

import { PrizeTierDto } from './prize-tier.dto';

export class CreateDrawDto {
  @IsEnum(DrawType)
  drawType!: DrawType;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  prizeDescription!: string;

  // Required for single-prize draws. For pools and stages the server works
  // it out (the guaranteed minimum, or the stages' total).
  @ValidateIf((o: CreateDrawDto) => !o.prizeModel || o.prizeModel === DrawPrizeModel.SINGLE)
  @IsInt()
  @IsPositive()
  prizeValueNgn?: number;

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

  // ─── Prize model ─────────────────────────────────────────
  // SINGLE (default): one winner wins prizeValueNgn.
  // POOL: pool = max(minimum, payout% × eligible revenue), split across tiers.
  // STAGES: jackpot stages, each with a set number of winners.
  @IsOptional()
  @IsEnum(DrawPrizeModel)
  prizeModel?: DrawPrizeModel;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  poolPayoutBp?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  poolMinimumNgn?: number;

  @IsOptional()
  @IsEnum(PoolRevenueBasis)
  poolRevenueBasis?: PoolRevenueBasis;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => PrizeTierDto)
  tiers?: PrizeTierDto[];
}
