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
  AdminTier,
  AuditActorType,
  AuditSeverity,
  ConfigVersionStatus,
  DrawTemplate,
  DrawTemplateType,
  DrawType,
  Prisma,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { MinTier } from '../admin-auth/decorators/min-tier.decorator';
import { headlinePrizeNgn, tiersOf } from '../products/products.service';

// A schedule. With productId: a product schedule for one slot (price and
// prizes come from the product, so they are not sent). Without: an old
// single-prize schedule, unchanged.
class ProposeTemplateDto {
  @IsOptional() @IsUUID() productId?: string;
  @ValidateIf((o: ProposeTemplateDto) => !!o.productId)
  @Matches(/^[A-Z0-9_]{2,20}$/, { message: 'Slot code must be 2 to 20 capital letters, digits or underscores, e.g. NOON' })
  slotCode?: string;

  @ValidateIf((o: ProposeTemplateDto) => !o.productId) @IsEnum(DrawTemplateType) templateType?: DrawTemplateType;
  @IsString() @Length(3, 120) label!: string;
  @ValidateIf((o: ProposeTemplateDto) => !o.productId) @IsString() @Length(3, 200) prizeDescription?: string;
  @ValidateIf((o: ProposeTemplateDto) => !o.productId) @IsInt() @Min(1) prizeValueNgn?: number;
  @ValidateIf((o: ProposeTemplateDto) => !o.productId) @IsInt() @Min(1) ticketPriceNgn?: number;
  @IsOptional() @IsInt() @Min(1) ticketQuota?: number;
  @IsInt() @Min(0) @Max(1439) cutoffMinutesWat!: number;
  @IsInt() @Min(0) @Max(1439) scheduledMinutesWat!: number;
  // When sales open (WAT minutes), and whether that is the evening before.
  @IsOptional() @IsInt() @Min(0) @Max(1439) salesOpenMinutesWat?: number;
  @IsOptional() @IsBoolean() salesOpenPreviousDay?: boolean;
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
  @MinTier(AdminTier.INTERMEDIATE)
  @Post()
  async propose(
    @Body() dto: ProposeTemplateDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    checkTimes(dto);
    if (dto.weekdays.some((d) => d < 0 || d > 6)) {
      throw new ConflictException('Weekdays must be 0 (Sunday) to 6 (Saturday)');
    }

    // Product schedules take price and prizes from the product.
    let productFields: {
      templateType: DrawTemplateType;
      prizeDescription: string;
      prizeValueNgn: number;
      ticketPriceNgn: number;
    } | null = null;
    if (dto.productId) {
      const product = await this.prisma.product.findUnique({ where: { productId: dto.productId } });
      if (!product) throw new NotFoundException('Product not found');
      if (!product.approvedAt) throw new ConflictException('Approve the product before scheduling it');
      productFields = {
        templateType: product.kind === DrawType.SATURDAY_JACKPOT ? DrawTemplateType.SATURDAY_JACKPOT : DrawTemplateType.DAILY_STANDARD,
        prizeDescription: product.prizeDescription,
        prizeValueNgn: Math.max(1, headlinePrizeNgn(product.kind, { ...product, tiers: tiersOf(product) })),
        ticketPriceNgn: product.ticketPriceNgn,
      };
    }

    const templateType = productFields?.templateType ?? (dto.templateType as DrawTemplateType);
    const key = versionKey({ templateType, productId: dto.productId ?? null, slotCode: dto.slotCode ?? null });

    const current = await this.prisma.drawTemplate.findFirst({
      where: { ...key, status: ConfigVersionStatus.ACTIVE },
      orderBy: { version: 'desc' },
    });

    const pending = await this.prisma.drawTemplate.findFirst({
      where: { ...key, status: ConfigVersionStatus.PENDING_APPROVAL },
    });
    if (pending) {
      throw new ConflictException(
        'A change for this template is already awaiting approval — approve or reject it first',
      );
    }

    const created = await this.prisma.drawTemplate.create({
      data: {
        templateType,
        productId: dto.productId ?? null,
        slotCode: dto.productId ? dto.slotCode ?? null : null,
        label: dto.label,
        prizeDescription: productFields?.prizeDescription ?? (dto.prizeDescription as string),
        prizeValueNgn: productFields?.prizeValueNgn ?? (dto.prizeValueNgn as number),
        ticketPriceNgn: productFields?.ticketPriceNgn ?? (dto.ticketPriceNgn as number),
        ticketQuota: dto.ticketQuota ?? null,
        cutoffMinutesWat: dto.cutoffMinutesWat,
        scheduledMinutesWat: dto.scheduledMinutesWat,
        salesOpenMinutesWat: dto.salesOpenMinutesWat ?? null,
        salesOpenPreviousDay: dto.salesOpenMinutesWat != null && !!dto.salesOpenPreviousDay,
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
        templateType,
        productId: created.productId,
        slotCode: created.slotCode,
        version: created.version,
        ticketPriceNgn: created.ticketPriceNgn,
        prizeValueNgn: created.prizeValueNgn,
        salesOpenMinutesWat: created.salesOpenMinutesWat,
        salesOpenPreviousDay: created.salesOpenPreviousDay,
        cutoffMinutesWat: created.cutoffMinutesWat,
        scheduledMinutesWat: created.scheduledMinutesWat,
        supersedes: current?.templateId ?? null,
      },
    });

    return this.toView(created);
  }

  @MinTier(AdminTier.SUPER)
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
      // Retire the version being replaced: same product and slot (or, for
      // old schedules, the same type), never another product's schedule.
      this.prisma.drawTemplate.updateMany({
        where: {
          ...versionKey(t),
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

  @MinTier(AdminTier.SUPER)
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
    productId: string | null;
    slotCode: string | null;
    salesOpenMinutesWat: number | null;
    salesOpenPreviousDay: boolean;
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
      productId: t.productId,
      slotCode: t.slotCode,
      salesOpenMinutesWat: t.salesOpenMinutesWat,
      salesOpenPreviousDay: t.salesOpenPreviousDay,
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

// Which versions replace each other: product schedules by product and slot;
// old schedules by type (and only those without a product).
function versionKey(t: Pick<DrawTemplate, 'templateType' | 'productId' | 'slotCode'>): Prisma.DrawTemplateWhereInput {
  return t.productId
    ? { productId: t.productId, slotCode: t.slotCode }
    : { templateType: t.templateType, productId: null };
}

// Sales open, then close, then the draw. Sales may open the evening before
// (7pm for a noon draw); otherwise everything is on the draw's day.
function checkTimes(dto: {
  cutoffMinutesWat: number;
  scheduledMinutesWat: number;
  salesOpenMinutesWat?: number;
  salesOpenPreviousDay?: boolean;
}) {
  if (dto.cutoffMinutesWat >= dto.scheduledMinutesWat) {
    throw new ConflictException('Cutoff must be earlier in the day than the draw time');
  }
  if (dto.salesOpenMinutesWat == null) return;
  if (!dto.salesOpenPreviousDay && dto.salesOpenMinutesWat >= dto.cutoffMinutesWat) {
    throw new ConflictException('Sales must open before the cutoff (or tick "opens the evening before")');
  }
  if (dto.salesOpenPreviousDay && dto.salesOpenMinutesWat <= dto.scheduledMinutesWat) {
    // e.g. opens 11:00 the day before a 12:00 draw: over 24 hours of sales,
    // which would overlap the previous day's draw for this slot.
    throw new ConflictException('A sales window that opens the evening before must open after the previous draw time');
  }
}
