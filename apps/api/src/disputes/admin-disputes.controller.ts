import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdminRole,
  AuditActorType,
  AuditSeverity,
  DisputeCategory,
  DisputeRaisedByType,
  DisputeStatus,
} from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { DisputesService } from './disputes.service';

class ListDisputesDto {
  @IsOptional() @IsEnum(DisputeStatus) status?: DisputeStatus;
  @IsOptional() @IsString() customerPhone?: string;
}

class CreateDisputeDto {
  @IsEnum(DisputeCategory) category!: DisputeCategory;
  @IsString() @Length(4, 2000) subject!: string;
  @IsString() @Length(6, 20) customerPhone!: string;
  @IsOptional() @IsString() ticketRef?: string;
  @IsOptional() @IsString() paymentTxnId?: string;
  @IsOptional() @IsString() claimId?: string;
  @IsOptional() @IsString() agentCode?: string;
}

class NoteDto {
  @IsString() @Length(2, 2000) note!: string;
}

class AssignDto {
  @IsString() assigneeAdminId!: string;
}

class TransitionDto {
  @IsEnum(DisputeStatus) to!: DisputeStatus;
  @IsOptional() @IsString() @Length(4, 2000) note?: string;
}

@Controller('admin/disputes')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR)
export class AdminDisputesController {
  constructor(
    private readonly disputes: DisputesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() q: ListDisputesDto) {
    return this.disputes.list({ status: q.status, customerPhone: q.customerPhone });
  }

  @Get(':disputeId')
  detail(@Param('disputeId') disputeId: string) {
    return this.disputes.detail(disputeId);
  }

  @Post()
  async create(@Body() dto: CreateDisputeDto, @CurrentAdmin() admin: AdminJwtPayload) {
    const d = await this.disputes.create({
      category: dto.category,
      subject: dto.subject,
      customerPhone: dto.customerPhone,
      raisedBy: { type: DisputeRaisedByType.ADMIN, id: admin.sub },
      ticketRef: dto.ticketRef,
      paymentTxnId: dto.paymentTxnId,
      claimId: dto.claimId,
      agentCode: dto.agentCode,
    });
    await this.writeAudit(admin.sub, 'DISPUTE_CREATED', d.disputeId, {
      ref: d.disputeRef,
      category: dto.category,
    });
    return d;
  }

  @Post(':disputeId/notes')
  note(
    @Param('disputeId') disputeId: string,
    @Body() dto: NoteDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.disputes.addNote(disputeId, { type: DisputeRaisedByType.ADMIN, id: admin.sub }, dto.note);
  }

  @Post(':disputeId/assign')
  assign(
    @Param('disputeId') disputeId: string,
    @Body() dto: AssignDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.disputes.assign(
      disputeId,
      { type: DisputeRaisedByType.ADMIN, id: admin.sub },
      dto.assigneeAdminId,
    );
  }

  @Post(':disputeId/transition')
  async transition(
    @Param('disputeId') disputeId: string,
    @Body() dto: TransitionDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    const d = await this.disputes.transition(
      disputeId,
      { type: DisputeRaisedByType.ADMIN, id: admin.sub },
      dto.to,
      dto.note,
    );
    const critical = dto.to === DisputeStatus.RESOLVED || dto.to === DisputeStatus.REJECTED;
    await this.writeAudit(
      admin.sub,
      'DISPUTE_STATUS_CHANGED',
      disputeId,
      { to: dto.to, note: dto.note ?? null },
      critical ? AuditSeverity.WARNING : AuditSeverity.INFO,
    );
    return d;
  }

  private writeAudit(
    adminId: string,
    action: string,
    disputeId: string,
    metadata: Record<string, unknown>,
    severity: AuditSeverity = AuditSeverity.INFO,
  ) {
    return this.audit.write({
      severity,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action,
      resource: { type: 'Dispute', id: disputeId },
      metadata,
    });
  }
}