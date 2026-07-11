import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminRole, AuditActorType, AuditSeverity } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { ComplianceAdminService } from './compliance-admin.service';

class AuditSearchDto {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsEnum(AuditActorType) actorType?: AuditActorType;
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsString() resourceType?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsEnum(AuditSeverity) severity?: AuditSeverity;
  @IsOptional() @IsISO8601() fromDate?: string;
  @IsOptional() @IsISO8601() toDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

class ReportQueryDto {
  @IsISO8601()
  date!: string;
}

@Controller('admin/compliance')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.COMPLIANCE_OFFICER)
export class ComplianceAdminController {
  constructor(private readonly compliance: ComplianceAdminService) {}

  @Get('audit')
  searchAudit(@Query() q: AuditSearchDto) {
    return this.compliance.searchAudit(q);
  }

  @Get('reports/daily')
  dailyReport(@Query() q: ReportQueryDto) {
    return this.compliance.dailyReport(q.date);
  }
}