import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AgentJwtPayload } from '../agent-auth.types';

export const CurrentAgent = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AgentJwtPayload => {
    const request = context.switchToHttp().getRequest<{
      user: AgentJwtPayload;
    }>();

    return request.user;
  },
);