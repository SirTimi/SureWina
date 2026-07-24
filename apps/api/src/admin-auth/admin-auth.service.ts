import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditActorType, AuditSeverity } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { AdminAuthResponse, AdminJwtPayload } from './admin-auth.types';
import { AdminLoginDto } from './dto/admin-login.dto';

@Injectable()
export class AdminAuthService {
  private readonly maxFailedAttempts = 5;
  private readonly lockoutMinutes = 15;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: AdminLoginDto): Promise<AdminAuthResponse> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const admin = await this.prismaService.adminUser.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (!admin) {
      await this.auditService.write({
        severity: AuditSeverity.WARNING,
        actor: {
          type: AuditActorType.ADMIN,
        },
        action: 'ADMIN_LOGIN_FAILED_UNKNOWN_EMAIL',
        resource: {
          type: 'AdminUser',
          id: normalizedEmail,
        },
        metadata: {
          email: this.maskEmail(normalizedEmail),
        },
      });

      throw new UnauthorizedException('Invalid admin credentials');
    }

    if (!admin.isActive) {
      await this.auditService.write({
        severity: AuditSeverity.WARNING,
        actor: {
          type: AuditActorType.ADMIN,
          id: admin.adminUserId,
        },
        action: 'ADMIN_LOGIN_BLOCKED_INACTIVE',
        resource: {
          type: 'AdminUser',
          id: admin.adminUserId,
        },
        metadata: {
          email: this.maskEmail(admin.email),
        },
      });

      throw new ForbiddenException('Admin account is inactive');
    }

    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      await this.auditService.write({
        severity: AuditSeverity.WARNING,
        actor: {
          type: AuditActorType.ADMIN,
          id: admin.adminUserId,
        },
        action: 'ADMIN_LOGIN_BLOCKED_LOCKED',
        resource: {
          type: 'AdminUser',
          id: admin.adminUserId,
        },
        metadata: {
          lockedUntil: admin.lockedUntil.toISOString(),
        },
      });

      throw new ForbiddenException('Admin account is temporarily locked');
    }

    const passwordValid = await bcrypt.compare(dto.password, admin.passwordHash);

    if (!passwordValid) {
      await this.recordFailedLogin(admin.adminUserId, admin.failedAttempts);

      await this.auditService.write({
        severity: AuditSeverity.WARNING,
        actor: {
          type: AuditActorType.ADMIN,
          id: admin.adminUserId,
        },
        action: 'ADMIN_LOGIN_FAILED_BAD_PASSWORD',
        resource: {
          type: 'AdminUser',
          id: admin.adminUserId,
        },
        metadata: {
          failedAttemptsBeforeLogin: admin.failedAttempts,
        },
      });

      throw new UnauthorizedException('Invalid admin credentials');
    }

    if (admin.mfaEnabled) {
      await this.auditService.write({
        severity: AuditSeverity.WARNING,
        actor: {
          type: AuditActorType.ADMIN,
          id: admin.adminUserId,
        },
        action: 'ADMIN_LOGIN_BLOCKED_MFA_NOT_IMPLEMENTED',
        resource: {
          type: 'AdminUser',
          id: admin.adminUserId,
        },
        metadata: {
          mfaEnabled: true,
        },
      });

      throw new ForbiddenException(
        'MFA is enabled for this admin, but MFA verification is not implemented yet',
      );
    }

    const updatedAdmin = await this.prismaService.adminUser.update({
      where: {
        adminUserId: admin.adminUserId,
      },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const accessToken = await this.signAdminAccessToken({
      sub: updatedAdmin.adminUserId,
      email: updatedAdmin.email,
      role: updatedAdmin.role,
      tier: updatedAdmin.tier,
      type: 'admin',
    });

    await this.auditService.write({
      actor: {
        type: AuditActorType.ADMIN,
        id: updatedAdmin.adminUserId,
      },
      action: 'ADMIN_LOGIN_SUCCEEDED',
      resource: {
        type: 'AdminUser',
        id: updatedAdmin.adminUserId,
      },
      metadata: {
        role: updatedAdmin.role,
        tier: updatedAdmin.tier,
      },
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: 30 * 60,
      admin: {
        adminUserId: updatedAdmin.adminUserId,
        email: updatedAdmin.email,
        fullName: updatedAdmin.fullName,
        role: updatedAdmin.role,
        tier: updatedAdmin.tier,
        mfaEnabled: updatedAdmin.mfaEnabled,
        lastLoginAt: updatedAdmin.lastLoginAt,
      },
    };
  }

  async getMe(adminUserId: string) {
    const admin = await this.prismaService.adminUser.findUnique({
      where: {
        adminUserId,
      },
      select: {
        adminUserId: true,
        email: true,
        fullName: true,
        role: true,
        tier: true,
        isActive: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Admin not found');
    }

    return admin;
  }

  private async recordFailedLogin(adminUserId: string, failedAttempts: number) {
    const nextFailedAttempts = failedAttempts + 1;

    const shouldLock = nextFailedAttempts >= this.maxFailedAttempts;

    const lockedUntil = shouldLock
      ? new Date(Date.now() + this.lockoutMinutes * 60 * 1000)
      : null;

    await this.prismaService.adminUser.update({
      where: {
        adminUserId,
      },
      data: {
        failedAttempts: nextFailedAttempts,
        lockedUntil,
      },
    });

    if (shouldLock) {
      await this.auditService.write({
        severity: AuditSeverity.CRITICAL,
        actor: {
          type: AuditActorType.ADMIN,
          id: adminUserId,
        },
        action: 'ADMIN_ACCOUNT_LOCKED',
        resource: {
          type: 'AdminUser',
          id: adminUserId,
        },
        metadata: {
          failedAttempts: nextFailedAttempts,
          lockedUntil: lockedUntil?.toISOString() ?? null,
        },
      });
    }
  }

  private async signAdminAccessToken(payload: AdminJwtPayload) {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '30m',
    });
  }

  private maskEmail(email: string) {
    const [name, domain] = email.split('@');

    if (!name || !domain) {
      return email;
    }

    if (name.length <= 2) {
      return `${name[0] ?? '*'}***@${domain}`;
    }

    return `${name.slice(0, 2)}***@${domain}`;
  }
}