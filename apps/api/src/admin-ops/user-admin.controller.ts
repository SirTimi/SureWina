import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminRole, AdminTier, AuditActorType, AuditSeverity } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';

class CreateAdminDto {
  @IsEmail() email!: string;
  @IsString() @Length(2, 120) fullName!: string;
  @IsEnum(AdminRole) role!: AdminRole;
  @IsEnum(AdminTier) tier!: AdminTier;
}

class UpdateAdminDto {
  @IsOptional() @IsEnum(AdminRole) role?: AdminRole;
  @IsOptional() @IsEnum(AdminTier) tier?: AdminTier;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// Memorable-enough temp password; the admin must change it on first login
// once C2d/11.3 adds forced rotation. Format: Sw-XXXXXXXX-XX
function tempPassword(): string {
  return `Sw-${randomBytes(6).toString('base64url')}-${randomBytes(2).toString('hex')}`;
}

const SAFE_SELECT = {
  adminUserId: true,
  email: true,
  fullName: true,
  role: true,
  tier: true,
  isActive: true,
  mfaEnabled: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
} as const;

@Controller('admin/users')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR)
export class UserAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.adminUser.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: SAFE_SELECT,
    });
    return { users: rows.map((u) => this.toView(u)) };
  }

  @Get(':adminUserId')
  async detail(@Param('adminUserId') adminUserId: string) {
    const u = await this.prisma.adminUser.findUnique({
      where: { adminUserId },
      select: SAFE_SELECT,
    });
    if (!u) throw new NotFoundException('Admin user not found');
    return this.toView(u);
  }

  @Post()
  async create(@Body() dto: CreateAdminDto, @CurrentAdmin() actor: AdminJwtPayload) {
    const exists = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('An admin with this email already exists');

    const password = tempPassword();
    const passwordHash = await bcrypt.hash(password, 12);

    const created = await this.prisma.adminUser.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        tier: dto.tier,
        passwordHash,
      },
      select: SAFE_SELECT,
    });

    await this.audit.write({
      severity: AuditSeverity.CRITICAL,
      actor: { type: AuditActorType.ADMIN, id: actor.sub },
      action: 'ADMIN_USER_CREATED',
      resource: { type: 'AdminUser', id: created.adminUserId },
      metadata: { email: dto.email, role: dto.role, tier: dto.tier },
    });

    // Returned exactly once, at creation — never retrievable again.
    return { ...this.toView(created), temporaryPassword: password };
  }

  @Patch(':adminUserId')
  async update(
    @Param('adminUserId') adminUserId: string,
    @Body() dto: UpdateAdminDto,
    @CurrentAdmin() actor: AdminJwtPayload,
  ) {
    const existing = await this.prisma.adminUser.findUnique({ where: { adminUserId } });
    if (!existing) throw new NotFoundException('Admin user not found');

    // Nobody deactivates or demotes themself — prevents the last-admin lockout.
    if (adminUserId === actor.sub && (dto.isActive === false || dto.tier || dto.role)) {
      throw new ConflictException('You cannot change your own role, tier, or active status');
    }

    const updated = await this.prisma.adminUser.update({
      where: { adminUserId },
      data: {
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.tier ? { tier: dto.tier } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: SAFE_SELECT,
    });

    await this.audit.write({
      severity: AuditSeverity.CRITICAL,
      actor: { type: AuditActorType.ADMIN, id: actor.sub },
      action: 'ADMIN_USER_UPDATED',
      resource: { type: 'AdminUser', id: adminUserId },
      metadata: {
        previous: { role: existing.role, tier: existing.tier, isActive: existing.isActive },
        next: dto,
      },
    });

    return this.toView(updated);
  }

  @Post(':adminUserId/reset-password')
  async resetPassword(
    @Param('adminUserId') adminUserId: string,
    @CurrentAdmin() actor: AdminJwtPayload,
  ) {
    const existing = await this.prisma.adminUser.findUnique({ where: { adminUserId } });
    if (!existing) throw new NotFoundException('Admin user not found');

    const password = tempPassword();
    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.adminUser.update({
      where: { adminUserId },
      data: { passwordHash, failedAttempts: 0, lockedUntil: null },
    });

    await this.audit.write({
      severity: AuditSeverity.CRITICAL,
      actor: { type: AuditActorType.ADMIN, id: actor.sub },
      action: 'ADMIN_PASSWORD_RESET',
      resource: { type: 'AdminUser', id: adminUserId },
      metadata: { email: existing.email },
    });

    return { adminUserId, temporaryPassword: password };
  }

  private toView(u: {
    adminUserId: string;
    email: string;
    fullName: string;
    role: AdminRole;
    tier: AdminTier;
    isActive: boolean;
    mfaEnabled: boolean;
    lastLoginAt: Date | null;
    lockedUntil: Date | null;
    createdAt: Date;
  }) {
    return {
      adminUserId: u.adminUserId,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      tier: u.tier,
      isActive: u.isActive,
      mfaEnabled: u.mfaEnabled,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      locked: !!(u.lockedUntil && u.lockedUntil.getTime() > Date.now()),
      createdAt: u.createdAt.toISOString(),
    };
  }
}