import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AdminPrincipal } from '@surewina/types';

export interface RequestWithAdminPrincipal {
  adminPrincipal?: AdminPrincipal;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminPrincipal => {
    const request = ctx.switchToHttp().getRequest<RequestWithAdminPrincipal>();
    if (!request.adminPrincipal) {
      throw new Error('Admin principal missing from request. Ensure AdminPermissionGuard is applied.');
    }
    return request.adminPrincipal;
  },
);
