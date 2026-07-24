import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminTier } from '@prisma/client';
import { AdminJwtPayload } from '../admin-auth.types';
import { MIN_TIER_KEY } from '../decorators/min-tier.decorator';

// Clearance is a ladder for write actions: BASIC acts, INTERMEDIATE proposes,
// SUPER approves. AUDITOR sits outside it — read-only by design, so it never
// clears a write gate.
const RANK: Record<AdminTier, number> = {
  AUDITOR: 0,
  BASIC: 1,
  INTERMEDIATE: 2,
  SUPER: 3,
};

@Injectable()
export class AdminTierGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminTier | undefined>(
      MIN_TIER_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @MinTier on this route — nothing to enforce.
    if (!required) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AdminJwtPayload }>();
    const admin = request.user;

    // Tokens issued before tier was in the payload carry no clearance.
    // Denying is correct; those sessions expire within 30 minutes.
    if (!admin?.tier) {
      throw new ForbiddenException(
        'Session predates clearance checks — please sign in again',
      );
    }

    if (RANK[admin.tier] < RANK[required]) {
      throw new ForbiddenException(
        `This action requires ${required} clearance; your account is ${admin.tier}`,
      );
    }

    return true;
  }
}