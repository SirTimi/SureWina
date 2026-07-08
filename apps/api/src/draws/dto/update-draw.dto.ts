import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

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
}