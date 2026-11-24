import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { AdminRole, AdminTier } from '@prisma/client';
import { IsString, Length } from 'class-validator';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { DrawReleaseService } from './draw-release.service';

class ApproveReleaseDto {
  @IsString() @Length(1, 200) password!: string;
  @IsString() @Length(6, 12) mfaCode!: string;
}

class RejectReleaseDto {
  @IsString() @Length(10, 500) reason!: string;
}

// Draw approvals (Phase 2). Any admin may look; who may decide is a setting
// (DRAW_RELEASE_APPROVER_TIERS / _ROLES) checked by the service, so the
// approvers can be changed without code.
@Controller('admin/draw-approvals')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR, AdminRole.FINANCE_OFFICER, AdminRole.COMPLIANCE_OFFICER)
export class DrawApprovalsController {
  constructor(private readonly releases: DrawReleaseService) {}

  @Get()
  pending() {
    return this.releases.pending();
  }

  @Get(':drawId')
  get(@Param('drawId', ParseUUIDPipe) drawId: string) {
    return this.releases.get(drawId);
  }

  @Get(':drawId/report.csv')
  async report(
    @Param('drawId', ParseUUIDPipe) drawId: string,
    @Res({ passthrough: true }) res: { header(k: string, v: string): unknown },
  ) {
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="draw-${drawId}-tickets.csv"`);
    return this.releases.reportCsv(drawId);
  }

  @Post(':drawId/approve')
  approve(
    @Param('drawId', ParseUUIDPipe) drawId: string,
    @Body() dto: ApproveReleaseDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.releases.approve(drawId, approver(admin), dto.password, dto.mfaCode);
  }

  @Post(':drawId/reject')
  reject(
    @Param('drawId', ParseUUIDPipe) drawId: string,
    @Body() dto: RejectReleaseDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.releases.reject(drawId, approver(admin), dto.reason);
  }

  @Post(':drawId/recheck')
  recheck(@Param('drawId', ParseUUIDPipe) drawId: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.releases.recheck(drawId, approver(admin));
  }

  // Gate 1, for a draw set up by hand.
  @Post(':drawId/setup/approve')
  approveSetup(@Param('drawId', ParseUUIDPipe) drawId: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.releases.approveSetup(drawId, approver(admin));
  }
}

function approver(admin: AdminJwtPayload) {
  return { sub: admin.sub, role: admin.role as AdminRole, tier: admin.tier as AdminTier };
}
