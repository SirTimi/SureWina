import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole, AdminTier } from '@prisma/client';
import { ADMIN_ROLES_KEY } from '../decorators/admin-roles.decorator';
import { AdminJwtPayload } from '../admin-auth.types';
import { DEPARTMENT_ONLY_KEY } from '../decorators/department-only.decorator';

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

    // SUPER clearance spans departments. Not a loosening: a SUPER admin can
    // already create an account in any role and sign in as it, so blocking
    // them here would be friction rather than a control. What still binds
    // them is maker-checker on config changes and the audit log.
    const departmentOnly =
      this.reflector.getAllAndOverride<boolean>(DEPARTMENT_ONLY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    // SUPER clearance spans departments — a SUPER admin can already create an
    // account in any role and sign in as it, so blocking them is friction
    // rather than control. The exception is @DepartmentOnly routes, where the
    // department is the point.
    if (admin.tier === AdminTier.SUPER && !departmentOnly) {
      return true;
    }

    if (!requiredRoles.includes(admin.role)) {
      throw new ForbiddenException('Insufficient admin role');
    }

    return true;
  }
}