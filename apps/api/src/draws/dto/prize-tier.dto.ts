import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// One prize tier (pool draw) or stage (jackpot). The full rules, such as the
// shares adding up to 100%, are checked by validatePrizeConfig.
export class PrizeTierDto {
  @IsInt()
  @Min(1)
  @Max(4)
  tierNo!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsBoolean()
  active!: boolean;

  // Pool draws: share of the pool in basis points (2500 = 25%).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  allocationBp?: number | null;

  // Jackpot stages: winners to pick.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  winnerCount?: number | null;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  prizePerWinnerNgn!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  prizeDescription?: string | null;

  // Jackpot stages only: the prize is the item named above, and the prize
  // per winner is its cash value.
  @IsOptional()
  @IsBoolean()
  itemPrize?: boolean;
}
