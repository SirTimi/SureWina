import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class InitiatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  drawCode!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100) // sanity cap per purchase; tune later
  quantity!: number;

  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneE164 must be a valid E.164 phone number',
  })
  phoneE164!: string;

  // State code for the "state of play" tracking (e.g. LAG, ABJ).
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{2,4}$/, { message: 'stateOfPlayCode must be 2-4 uppercase letters' })
  stateOfPlayCode!: string;
}