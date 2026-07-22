import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AdminRole, AuditActorType, AuditSeverity } from '@prisma/client';
import { IsString, Length, Matches } from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../config/settings.service';

class UpdateSettingDto {
  // Settings are numeric-only today; the pattern keeps garbage out at the door.
  @IsString()
  @Length(1, 32)
  @Matches(/^\d+(\.\d+)?$/, { message: 'value must be a non-negative number' })
  value!: string;
}

@Controller('admin/settings')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR)
export class SettingsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
    return {
      settings: rows.map((s) => ({
        key: s.key,
        value: s.value,
        description: s.description,
        updatedByAdminId: s.updatedByAdminId,
        updatedAt: s.updatedAt.toISOString(),
      })),
    };
  }

  @Patch(':key')
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    const existing = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException('Unknown setting'); // no creating new keys via API

    const updated = await this.prisma.systemSetting.update({
      where: { key },
      data: { value: dto.value, updatedByAdminId: admin.sub },
    });

    this.settings.invalidate(key);

    await this.audit.write({
      severity: AuditSeverity.CRITICAL,
      actor: { type: AuditActorType.ADMIN, id: admin.sub },
      action: 'SYSTEM_SETTING_CHANGED',
      resource: { type: 'SystemSetting', id: key },
      metadata: { previous: existing.value, next: dto.value },
    });

    return {
      key: updated.key,
      value: updated.value,
      description: updated.description,
      updatedByAdminId: updated.updatedByAdminId,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}