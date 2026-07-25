import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditActorType, AuditSeverity } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  AdminAuthResponse,
  AdminJwtPayload,
  AdminLoginResult,
  AdminMfaChallenge,
} from './admin-auth.types';
import { AdminLoginDto } from './dto/admin-login.dto';

// Accept the adjacent 30s step either side — phone clocks drift.
const EPOCH_TOLERANCE_SECONDS = 30;

@Injectable()
export class AdminAuthService {
  private readonly maxFailedAttempts = 5;
  private readonly lockoutMinutes = 15;
  private readonly mfaChallengePrefix = 'admin:mfa:challenge';
  private readonly mfaChallengeTtlSeconds = 300;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
  ) {}

  async login(dto: AdminLoginDto): Promise<AdminLoginResult> {
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

    // MFA gate sits after the password check, so a caller can't discover
    // which accounts have MFA without valid credentials.
    if (admin.mfaEnabled) {
      // The password stage genuinely passed — clear the lockout counter.
      await this.prismaService.adminUser.update({
        where: { adminUserId: admin.adminUserId },
        data: { failedAttempts: 0, lockedUntil: null },
      });

      const challengeId = randomUUID();
      await this.redisService.setJson(
        `${this.mfaChallengePrefix}:${challengeId}`,
        {
          adminUserId: admin.adminUserId,
          createdAt: new Date().toISOString(),
        } satisfies AdminMfaChallenge,
        this.mfaChallengeTtlSeconds,
      );

      await this.auditService.write({
        actor: {
          type: AuditActorType.ADMIN,
          id: admin.adminUserId,
        },
        action: 'ADMIN_MFA_CHALLENGE_ISSUED',
        resource: {
          type: 'AdminUser',
          id: admin.adminUserId,
        },
        metadata: {
          email: this.maskEmail(admin.email),
        },
      });

      return {
        mfaRequired: true as const,
        challengeId,
        expiresInSeconds: this.mfaChallengeTtlSeconds,
      };
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
        mfa: 'none',
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

  // Completes login. Accepts a 6-digit TOTP or a backup code; a used backup
  // code is consumed so it can never work twice.
  async verifyMfa(challengeId: string, code: string): Promise<AdminAuthResponse> {
    const key = `${this.mfaChallengePrefix}:${challengeId}`;
    const challenge = await this.redisService.getJson<AdminMfaChallenge>(key);

    if (!challenge) {
      throw new UnauthorizedException('Verification expired — sign in again');
    }

    const admin = await this.prismaService.adminUser.findUnique({
      where: { adminUserId: challenge.adminUserId },
    });

    if (!admin || !admin.isActive || !admin.mfaSecret) {
      await this.redisService.delete(key);
      throw new UnauthorizedException('Admin not found');
    }

    const normalized = code.trim().toUpperCase();
    let usedBackupCode = false;

    const totpCheck = await verify({
      secret: admin.mfaSecret,
      token: normalized,
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });

    let valid = totpCheck.valid;

    if (!valid && admin.mfaBackupCodes.length > 0) {
      for (const hash of admin.mfaBackupCodes) {
        if (await bcrypt.compare(normalized, hash)) {
          valid = true;
          usedBackupCode = true;

          await this.prismaService.adminUser.update({
            where: { adminUserId: admin.adminUserId },
            data: {
              mfaBackupCodes: admin.mfaBackupCodes.filter((h) => h !== hash),
            },
          });
          break;
        }
      }
    }

    if (!valid) {
      await this.auditService.write({
        severity: AuditSeverity.WARNING,
        actor: {
          type: AuditActorType.ADMIN,
          id: admin.adminUserId,
        },
        action: 'ADMIN_MFA_FAILED',
        resource: {
          type: 'AdminUser',
          id: admin.adminUserId,
        },
        metadata: {},
      });

      throw new UnauthorizedException('Invalid verification code');
    }

    // One challenge, one token — a challenge id can't be replayed.
    await this.redisService.delete(key);

    const updatedAdmin = await this.prismaService.adminUser.update({
      where: { adminUserId: admin.adminUserId },
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
      // A backup code means the authenticator wasn't available — worth
      // noticing, especially if they start running out.
      severity: usedBackupCode ? AuditSeverity.WARNING : AuditSeverity.INFO,
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
        mfa: usedBackupCode ? 'backup_code' : 'totp',
        backupCodesRemaining: usedBackupCode
          ? admin.mfaBackupCodes.length - 1
          : admin.mfaBackupCodes.length,
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

  // Starts enrollment: stores a secret but leaves MFA OFF. An abandoned
  // enrolment must never lock anyone out, so nothing changes until the
  // admin proves they can generate a valid code.
  async setupMfa(adminUserId: string) {
    const admin = await this.prismaService.adminUser.findUnique({
      where: { adminUserId },
    });
    if (!admin) throw new UnauthorizedException('Admin not found');
    if (admin.mfaEnabled) {
      throw new ConflictException(
        'MFA is already active — disable it before re-enrolling',
      );
    }

    const secret = generateSecret();

    await this.prismaService.adminUser.update({
      where: { adminUserId },
      data: { mfaSecret: secret },
    });

    return {
      secret,
      otpauthUri: generateURI({
        issuer: 'Surewina Admin',
        label: admin.email,
        secret,
      }),
    };
  }

  // Confirms enrollment with a live code, then issues single-use backup
  // codes. This is the only moment they exist in readable form.
  async activateMfa(adminUserId: string, token: string) {
    const admin = await this.prismaService.adminUser.findUnique({
      where: { adminUserId },
    });
    if (!admin) throw new UnauthorizedException('Admin not found');
    if (admin.mfaEnabled) throw new ConflictException('MFA is already active');
    if (!admin.mfaSecret) throw new ConflictException('Start enrollment first');

    const check = await verify({
      secret: admin.mfaSecret,
      token: token.trim(),
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });

    if (!check.valid) {
      throw new UnauthorizedException(
        'That code is not valid. Check your phone clock is accurate and try the current code.',
      );
    }

    const backupCodes = this.generateBackupCodes();
    const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));

    await this.prismaService.adminUser.update({
      where: { adminUserId },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: hashed,
        mfaEnrolledAt: new Date(),
      },
    });

    await this.auditService.write({
      severity: AuditSeverity.CRITICAL,
      actor: { type: AuditActorType.ADMIN, id: adminUserId },
      action: 'ADMIN_MFA_ENABLED',
      resource: { type: 'AdminUser', id: adminUserId },
      metadata: { backupCodesIssued: backupCodes.length },
    });

    return { backupCodes };
  }

  // Stored as bcrypt hashes — these are credentials, not tokens.
  private generateBackupCodes(count = 10): string[] {
    return Array.from({ length: count }, () => {
      const raw = randomBytes(5).toString('hex').toUpperCase();
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
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