import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CustomerJwtPayload } from '../auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CustomerJwtPayload => {
    const request = context.switchToHttp().getRequest<{
      user: CustomerJwtPayload;
    }>();

    return request.user;
  },
);