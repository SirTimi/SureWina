import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class ResolveTransferDto {
  @IsIn(['POSTED', 'NOT_POSTED'])
  outcome!: 'POSTED' | 'NOT_POSTED';

  // The CBA's own transfer ID, from Witmango. Required for POSTED.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cbaTransferId?: number;

  // What was checked in Witmango. Kept in the audit trail.
  @IsString()
  @Length(10, 500)
  note!: string;
}
