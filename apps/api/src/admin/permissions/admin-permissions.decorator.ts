import { SetMetadata } from '@nestjs/common';
import type { AdminAction } from '@surewina/types';

export const ADMIN_ACTION_METADATA_KEY = 'surewina:admin_action';

export function RequireAdminAction(action: AdminAction) {
  return SetMetadata(ADMIN_ACTION_METADATA_KEY, action);
}
