import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentRequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();

    return request.headers['x-request-id'];
  },
);