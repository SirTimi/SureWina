import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminRole, AuditActorType, AuditSeverity } from '@prisma/client';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';

class CreatePointDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(2, 10) stateCode!: string;
  @IsString() @Length(5, 300) address!: string;
  @IsOptional() @IsString() @MaxLength(20) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(120) openingHours?: string;
}

class UpdatePointDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(2, 10) stateCode?: string;
  @IsOptional() @IsString() @Length(5, 300) address?: string;
  @IsOptional() @IsString() @MaxLength(20) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(120) openingHours?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// Physical locations where winners collect prizes. Operations manage the
// estate; compliance need the same access because they own the claim
// lifecycle that ends at one of these counters.
@Controller('admin/collection-points')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR, AdminRole.COMPLIANCE_OFFICER)
export class CollectionPointAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query('includeInactive') includeInactive?: string) {
    const points = await this.prisma.collectionPoint.findMany({
      where: includeInactive === 'true' ? undefined : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { stateCode: 'asc' }, { name: 'asc' }],
    });

    // Staff counts come from the admin users assigned to each point, so an
    // operator can see at a glance which points nobody can actually work.
    const staffCounts = await this.prisma.adminUser.groupBy({
      by: ['collectionPointId'],
      where: { collectionPointId: { not: null }, isActive: true },
      _count: true,
    });
    const byPoint = new Map(
      staffCounts.map((s) => [s.collectionPointId, s._count]),
    );

    return {
      points: points.map((p) => ({
        pointId: p.pointId,
        name: p.name,
        stateCode: p.stateCode,
        address: p.address,
        contactPhone: p.contactPhone,
        openingHours: p.openingHours,
        isActive: p.isActive,
        staffCount: byPoint.get(p.pointId) ?? 0,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  @Post()
  async create(
    @Body() dto: CreatePointDto,
    @CurrentAdmin() actor: AdminJwtPayload,
  ) {
    const point = await this.prisma.collectionPoint.create({
      data: {
        name: dto.name.trim(),
        stateCode: dto.stateCode.trim().toUpperCase(),
        address: dto.address.trim(),
        contactPhone: dto.contactPhone?.trim() || null,
        openingHours: dto.openingHours?.trim() || null,
      },
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: actor.sub },
      action: 'COLLECTION_POINT_CREATED',
      resource: { type: 'CollectionPoint', id: point.pointId },
      metadata: { name: point.name, stateCode: point.stateCode },
    });

    return point;
  }

  @Patch(':pointId')
  async update(
    @Param('pointId') pointId: string,
    @Body() dto: UpdatePointDto,
    @CurrentAdmin() actor: AdminJwtPayload,
  ) {
    const existing = await this.prisma.collectionPoint.findUnique({
      where: { pointId },
    });
    if (!existing) throw new NotFoundException('Collection point not found');

    // Closing a point that still has staff assigned would leave them able to
    // sign in with nowhere to work, and their redemptions would be scoped to
    // a counter that is supposed to be shut.
    if (dto.isActive === false) {
      const staff = await this.prisma.adminUser.count({
        where: { collectionPointId: pointId, isActive: true },
      });
      if (staff > 0) {
        throw new BadRequestException(
          `${staff} active staff member(s) are still assigned here. Reassign them before closing this point.`,
        );
      }
    }

    const updated = await this.prisma.collectionPoint.update({
      where: { pointId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.stateCode ? { stateCode: dto.stateCode.trim().toUpperCase() } : {}),
        ...(dto.address ? { address: dto.address.trim() } : {}),
        ...(dto.contactPhone !== undefined
          ? { contactPhone: dto.contactPhone.trim() || null }
          : {}),
        ...(dto.openingHours !== undefined
          ? { openingHours: dto.openingHours.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.audit.write({
      severity:
        dto.isActive === false ? AuditSeverity.WARNING : AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: actor.sub },
      action:
        dto.isActive === false
          ? 'COLLECTION_POINT_CLOSED'
          : 'COLLECTION_POINT_UPDATED',
      resource: { type: 'CollectionPoint', id: pointId },
      metadata: {
        previous: {
          name: existing.name,
          stateCode: existing.stateCode,
          isActive: existing.isActive,
        },
        next: dto,
      },
    });

    return updated;
  }
}