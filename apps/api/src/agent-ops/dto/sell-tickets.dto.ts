import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class SellTicketsDto {
  @IsString()
  @IsNotEmpty()
  drawCode!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50) // street-sale sanity cap
  quantity!: number;

  // Optional: customer's phone. Present → they get the SMS + accumulation.
  // Absent → agent reads the ref aloud; no accumulation.
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'customerPhone must be E.164' })
  customerPhone?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{2,4}$/)
  stateOfPlayCode!: string;
}
