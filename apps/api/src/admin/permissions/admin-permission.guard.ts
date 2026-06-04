import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  type AdminAction,
  type AdminPrincipal,
  evaluateAdminPermission,
} from '@surewina/types';
import { ADMIN_ACTION_METADATA_KEY } from './admin-permissions.decorator.js';
import type { RequestWithAdminPrincipal } from './admin-principal.decorator.js';

interface RequestWithHeadersAndBody extends RequestWithAdminPrincipal {
  headers: Record<string, string | string[] | undefined>;
  body?: {
    initiatedByAdminUserId?: string | null;
    createdByAdminUserId?: string | null;
    requestedByAdminUserId?: string | null;
  };
}

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const action = this.reflector.getAllAndOverride<AdminAction | undefined>(
      ADMIN_ACTION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!action) return true;

    const request = context.switchToHttp().getRequest<RequestWithHeadersAndBody>();
    const principal = extractAdminPrincipal(request);
    request.adminPrincipal = principal;

    const initiatedByAdminUserId =
      request.body?.initiatedByAdminUserId ??
      request.body?.createdByAdminUserId ??
      request.body?.requestedByAdminUserId ??
      null;

    const decision = evaluateAdminPermission({
      principal,
      action,
      initiatedByAdminUserId,
    });

    if (!decision.allowed) {
      throw new ForbiddenException(decision.reason ?? 'Admin permission denied.');
    }

    return true;
  }
}

function extractAdminPrincipal(request: RequestWithHeadersAndBody): AdminPrincipal {
  const adminUserId = readHeader(request, 'x-admin-user-id');
  const email = readHeader(request, 'x-admin-email');
  const role = readHeader(request, 'x-admin-role');

  if (!adminUserId || !email || !role) {
    throw new UnauthorizedException('Missing admin identity headers.');
  }

  if (!['BASIC_ADMIN', 'INTERMEDIATE_ADMIN', 'SUPER_ADMIN', 'AUDITOR'].includes(role)) {
    throw new UnauthorizedException('Invalid admin role.');
  }

  return {
    adminUserId,
    email,
    role: role as AdminPrincipal['role'],
  };
}

function readHeader(request: RequestWithHeadersAndBody, key: string): string | null {
  const value = request.headers[key] ?? request.headers[key.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
