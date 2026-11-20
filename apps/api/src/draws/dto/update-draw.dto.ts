import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  Max,
  Min,
  ValidateNested,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DrawPrizeModel, PoolRevenueBasis } from '@prisma/client';

import { PrizeTierDto } from './prize-tier.dto';

// Only mutable fields. drawType is immutable once created; status changes go
// through dedicated transitions (cancel here, execute in Phase 7).
export class UpdateDrawDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  prizeDescription?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  prizeValueNgn?: number;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  prizeImageUrl?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  ticketPriceNgn?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  ticketQuota?: number;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsISO8601()
  cutoffAt?: string;

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
