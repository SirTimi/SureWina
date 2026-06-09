import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminJwtPayload } from '../admin-auth.types';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminJwtPayload => {
    const request = context.switchToHttp().getRequest<{
      user: AdminJwtPayload;
    }>();

    return request.user;
  },
);