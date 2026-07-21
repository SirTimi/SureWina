import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdminRole,
  AuditActorType,
  AuditSeverity,
  ConfigVersionStatus,
  DrawTemplateType,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';

class ProposeTemplateDto {
  @IsEnum(DrawTemplateType) templateType!: DrawTemplateType;
  @IsString() @Length(3, 120) label!: string;
  @IsString() @Length(3, 200) prizeDescription!: string;
  @IsInt() @Min(1) prizeValueNgn!: number;
  @IsInt() @Min(1) ticketPriceNgn!: number;
  @IsOptional() @IsInt() @Min(1) ticketQuota?: number;
  @IsInt() @Min(0) @Max(1439) cutoffMinutesWat!: number;
  @IsInt() @Min(0) @Max(1439) scheduledMinutesWat!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) weekdays!: number[];
  @IsOptional() @IsString() effectiveFrom?: string;
}

class RejectTemplateDto {
  @IsString() @Length(4, 500) note!: string;
}

class ListTemplatesQueryDto {
  @IsOptional() @IsEnum(ConfigVersionStatus) status?: ConfigVersionStatus;
}

@Controller('admin/draw-templates')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR)
export class DrawTemplateController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query() q: ListTemplatesQueryDto) {
    const rows = await this.prisma.drawTemplate.findMany({
      where: q.status ? { status: q.status } : undefined,
      orderBy: [{ templateType: 'asc' }, { version: 'desc' }],
      take: 100,
    });
    return { templates: rows.map((t) => this.toView(t)) };
  }

  // Proposing never edits in place: it creates the next version in
  // PENDING_APPROVAL, leaving the current ACTIVE config untouched.
  @Post()
  async propose(
    @Body() dto: ProposeTemplateDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    if (dto.cutoffMinutesWat >= dto.scheduledMinutesWat) {
      throw new ConflictException('Cutoff must be earlier in the day than the draw time');
    }
    if (dto.weekdays.some((d) => d < 0 || d > 6)) {
      throw new ConflictException('Weekdays must be 0 (Sunday) to 6 (Saturday)');
    }

    const current = await this.prisma.drawTemplate.findFirst({
      where: { templateType: dto.templateType, status: ConfigVersionStatus.ACTIVE },
      orderBy: { version: 'desc' },
    });

    const pending = await this.prisma.drawTemplate.findFirst({
      where: {
        templateType: dto.templateType,
        status: ConfigVersionStatus.PENDING_APPROVAL,
      },
    });
    if (pending) {
      throw new ConflictException(
        'A change for this template is already awaiting approval — approve or reject it first',
      );
    }

    const created = await this.prisma.drawTemplate.create({
      data: {
        templateType: dto.templateType,
        label: dto.label,
        prizeDescription: dto.prizeDescription,
        prizeValueNgn: dto.prizeValueNgn,
        ticketPriceNgn: dto.ticketPriceNgn,
        ticketQuota: dto.ticketQuota ?? null,
        cutoffMinutesWat: dto.cutoffMinutesWat,
        scheduledMinutesWat: dto.scheduledMinutesWat,
        weekdays: dto.weekdays,
        version: (current?.version ?? 0) + 1,
        status: ConfigVersionStatus.PENDING_APPROVAL,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        createdByAdminId: admin.sub,
        supersedesId: current?.templateId ?? null,
      },
    });

    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: admin.sub },
      action: 'DRAW_TEMPLATE_PROPOSED',
      resource: { type: 'DrawTemplate', id: created.templateId },
      metadata: {
        templateType: dto.templateType,
        version: created.version,
        ticketPriceNgn: dto.ticketPriceNgn,
        prizeValueNgn: dto.prizeValueNgn,
        supersedes: current?.templateId ?? null,
      },
    });

    return this.toView(created);
  }

  @Post(':templateId/approve')
  async approve(
    @Param('templateId') templateId: string,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    const t = await this.prisma.drawTemplate.findUnique({ where: { templateId } });
    if (!t) throw new NotFoundException('Template version not found');
    if (t.status !== ConfigVersionStatus.PENDING_APPROVAL) {
      throw new ConflictException(`Version is not awaiting approval (status: ${t.status})`);
    }
    // Separation of duties: the proposer cannot approve their own change.
    if (t.createdByAdminId === admin.sub) {
      throw new ConflictException(
        'A configuration change must be approved by a different admin than the one who proposed it',
      );
    }

    const now = new Date();

    const [, activated] = await this.prisma.$transaction([
      // Retire the version being replaced.
      this.prisma.drawTemplate.updateMany({
        where: {
          templateType: t.templateType,
          status: ConfigVersionStatus.ACTIVE,
        },
        data: { status: ConfigVersionStatus.SUPERSEDED, effectiveTo: now },
      }),
      this.prisma.drawTemplate.update({
        where: { templateId },
        data: {
          status: ConfigVersionStatus.ACTIVE,
          approvedByAdminId: admin.sub,
          approvedAt: now,
          effectiveFrom: t.effectiveFrom.getTime() < now.getTime() ? now : t.effectiveFrom,
        },
      }),
    ]);

    await this.audit.write({
      severity: AuditSeverity.CRITICAL,
      actor: { type: AuditActorType.ADMIN, id: admin.sub },
      action: 'DRAW_TEMPLATE_APPROVED',
      resource: { type: 'DrawTemplate', id: templateId },
      metadata: {
        templateType: t.templateType,
        version: t.version,
        proposedBy: t.createdByAdminId,
        ticketPriceNgn: t.ticketPriceNgn,
      },
    });

    return this.toView(activated);
  }

  @Post(':templateId/reject')
  async reject(
    @Param('templateId') templateId: string,
    @Body() dto: RejectTemplateDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    const t = await this.prisma.drawTemplate.findUnique({ where: { templateId } });
    if (!t) throw new NotFoundException('Template version not found');
    if (t.status !== ConfigVersionStatus.PENDING_APPROVAL) {
      throw new ConflictException(`Version is not awaiting approval (status: ${t.status})`);
    }

    const updated = await this.prisma.drawTemplate.update({
      where: { templateId },
      data: { status: ConfigVersionStatus.REJECTED, rejectionNote: dto.note },
    });

    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: admin.sub },
      action: 'DRAW_TEMPLATE_REJECTED',
      resource: { type: 'DrawTemplate', id: templateId },
      metadata: { templateType: t.templateType, version: t.version, note: dto.note },
    });

    return this.toView(updated);
  }

  private toView(t: {
    templateId: string;
    templateType: DrawTemplateType;
    label: string;
    prizeDescription: string;
    prizeValueNgn: number;
    ticketPriceNgn: number;
    ticketQuota: number | null;
    cutoffMinutesWat: number;
    scheduledMinutesWat: number;
    weekdays: number[];
    version: number;
    status: ConfigVersionStatus;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    createdByAdminId: string;
    approvedByAdminId: string | null;
    approvedAt: Date | null;
    rejectionNote: string | null;
    supersedesId: string | null;
    createdAt: Date;
  }) {
    return {
      templateId: t.templateId,
      templateType: t.templateType,
      label: t.label,
      prizeDescription: t.prizeDescription,
      prizeValueNgn: t.prizeValueNgn,
      ticketPriceNgn: t.ticketPriceNgn,
      ticketQuota: t.ticketQuota,
      cutoffMinutesWat: t.cutoffMinutesWat,
      scheduledMinutesWat: t.scheduledMinutesWat,
      weekdays: t.weekdays,
      version: t.version,
      status: t.status,
      effectiveFrom: t.effectiveFrom.toISOString(),
      effectiveTo: t.effectiveTo?.toISOString() ?? null,
      createdByAdminId: t.createdByAdminId,
      approvedByAdminId: t.approvedByAdminId,
      approvedAt: t.approvedAt?.toISOString() ?? null,
      rejectionNote: t.rejectionNote,
      supersedesId: t.supersedesId,
      createdAt: t.createdAt.toISOString(),
    };
  }
}