import { IsISO8601, IsString, IsUUID } from 'class-validator';

export class BookCollectionDto {
  @IsUUID()
  collectionPointId!: string;

  // ISO 8601, e.g. "2026-07-14T10:00:00.000Z". Must be in the future —
  // enforced in the service, where "now" is evaluated.
  @IsISO8601()
  preferredDate!: string;
}