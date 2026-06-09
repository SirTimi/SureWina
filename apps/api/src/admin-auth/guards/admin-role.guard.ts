import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@prisma/client';
import { ADMIN_ROLES_KEY } from '../decorators/admin-roles.decorator';
import { AdminJwtPayload } from '../admin-auth.types';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AdminJwtPayload;
    }>();

    const admin = request.user;

    if (!admin) {
      throw new ForbiddenException('Admin context missing');
    }

    if (!requiredRoles.includes(admin.role)) {
      throw new ForbiddenException('Insufficient admin role');
    }

    return true;
  }
}