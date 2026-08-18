import {
    BadRequestException,
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
  IsUUID,
  Length,
} from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { AdminTierGuard } from '../admin-auth/guards/admin-tier.guard';
import { MinTier } from '../admin-auth/decorators/min-tier.decorator';
import { AdminTokenRevocationService } from '../admin-auth/admin-token-revocation.service';

class CreateAdminDto {
  @IsEmail() email!: string;
  @IsString() @Length(2, 120) fullName!: string;
  @IsEnum(AdminRole) role!: AdminRole;
  @IsEnum(AdminTier) tier!: AdminTier;
  @IsOptional() @IsUUID() collectionPointId?: string;
}

class UpdateAdminDto {
  @IsOptional() @IsEnum(AdminRole) role?: AdminRole;
  @IsOptional() @IsEnum(AdminTier) tier?: AdminTier;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsUUID() collectionPointId?: string;
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
  collectionPointId: true,
  isActive: true,
  mfaEnabled: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
} as const;


// A support agent with no point can redeem a claim booked at any counter,
// which defeats the scoping entirely. Creation is the only place this is
// cheap to catch. Returns null for every other department, so moving someone
// out of support clears a stale assignment rather than leaving it behind.
async function assertPoint(
  prisma: PrismaService,
  role: AdminRole,
  collectionPointId?: string,
): Promise<string | null> {
  if (role !== AdminRole.SUPPORT_AGENT) return null;
  if (!collectionPointId){
    throw new BadRequestException(
      'Support staff must be assigned to a collection point',
    );
  }
  const point = await prisma.collectionPoint.findFirst({
    where: { pointId: collectionPointId, isActive: true},
  });
  if (!point) throw new BadRequestException('Collection point not found or inactive');
  return point.pointId;
}
@Controller('admin/users')
@UseGuards(AdminJwtGuard, AdminRoleGuard, AdminTierGuard)
@AdminRoles(AdminRole.OPERATOR)
export class UserAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revocation: AdminTokenRevocationService
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

  // Populates the collection point picker on the admin create form. Lives
  // here rather than reusing /claims/collection-points/list, which sits
  // behind the customer guard and rejects an admin token.
  @Get('collection-points/list')
  async collectionPoints() {
    const points = await this.prisma.collectionPoint.findMany({
      where: { isActive: true },
      orderBy: [{ stateCode: 'asc' }, { name: 'asc' }],
      select: { pointId: true, name: true, stateCode: true, address: true },
    });
    return { points };
  }

  @MinTier(AdminTier.SUPER)
  @Post()
  async create(@Body() dto: CreateAdminDto, @CurrentAdmin() actor: AdminJwtPayload) {
    const exists = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('An admin with this email already exists');

    const password = tempPassword();
    const passwordHash = await bcrypt.hash(password, 12);
    const pointId = await assertPoint(this.prisma, dto.role, dto.collectionPointId);

    const created = await this.prisma.adminUser.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        tier: dto.tier,
        collectionPointId: pointId,
        passwordHash,
        mustChangePassword: true
      },
      select: SAFE_SELECT,
    });

    await this.audit.write({
      severity: AuditSeverity.CRITICAL,
      actor: { type: AuditActorType.ADMIN, id: actor.sub },
      action: 'ADMIN_USER_CREATED',
      resource: { type: 'AdminUser', id: created.adminUserId },
      metadata: {
        email: dto.email,
        role: dto.role,
        tier: dto.tier,
        collectionPointId: pointId,
      },
    });

    // Returned exactly once, at creation — never retrievable again.
    return { ...this.toView(created), temporaryPassword: password };
  }


  @MinTier(AdminTier.SUPER)
  @Patch(':adminUserId')
  async update(
    @Param('adminUserId') adminUserId: string,
    @Body() dto: UpdateAdminDto,
    @CurrentAdmin() actor: AdminJwtPayload,
  ) {
    // Nobody deactivates or demotes themself — prevents the last-admin
    // lockout. Checked before anything hits the database.
    if (adminUserId === actor.sub && (dto.isActive === false || dto.tier || dto.role)) {
      throw new ConflictException('You cannot change your own role, tier, or active status');
    }

    const existing = await this.prisma.adminUser.findUnique({
      where: { adminUserId },
      select: {
        role: true,
        tier: true,
        isActive: true,
        collectionPointId: true,
      },
    });
    if (!existing) throw new NotFoundException('Admin user not found');

    // Validated against the resulting role, not the current one: someone can
    // be moved into support (needs a point) or out of it (must lose one).
    const nextRole = dto.role ?? existing.role;
    const pointId = await assertPoint(
      this.prisma,
      nextRole,
      dto.collectionPointId ?? existing.collectionPointId ?? undefined,
    );

    if (dto.isActive === false || dto.tier || dto.role) {
      await this.revocation.revokeAll(adminUserId)
    }

    const updated = await this.prisma.adminUser.update({
      where: { adminUserId },
      data: {
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.tier ? { tier: dto.tier } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        // Always written, never conditional: leaving a stale point on someone
        // moved out of support would keep them scoped to a counter they no
        // longer work.
        collectionPointId: pointId,
      },
      select: SAFE_SELECT,
    });

    await this.audit.write({
      severity: AuditSeverity.CRITICAL,
      actor: { type: AuditActorType.ADMIN, id: actor.sub },
      action: 'ADMIN_USER_UPDATED',
      resource: { type: 'AdminUser', id: adminUserId },
      metadata: {
        previous: {
          role: existing.role,
          tier: existing.tier,
          isActive: existing.isActive,
          collectionPointId: existing.collectionPointId,
        },
        next: { ...dto, collectionPointId: pointId },
      },
    });

    return this.toView(updated);
  }

  @MinTier(AdminTier.SUPER)
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
      data: { 
        passwordHash, 
        failedAttempts: 0, 
        lockedUntil: null,
        mustChangePassword: true 
      },
    });

    await this.revocation.revokeAll(adminUserId)

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
    collectionPointId: string | null;
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
      collectionPointId: u.collectionPointId,
      isActive: u.isActive,
      mfaEnabled: u.mfaEnabled,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      locked: !!(u.lockedUntil && u.lockedUntil.getTime() > Date.now()),
      createdAt: u.createdAt.toISOString(),
    };
  }
}