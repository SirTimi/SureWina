import { SetMetadata } from '@nestjs/common';
import { AdminTier } from '@prisma/client';

export const MIN_TIER_KEY = 'minAdminTier';

export const MinTier = (tier: AdminTier) => SetMetadata(MIN_TIER_KEY, tier);