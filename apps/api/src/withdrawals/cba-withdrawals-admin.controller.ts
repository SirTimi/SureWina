import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminRole, AdminTier, CbaWithdrawalStatus } from '@prisma/client';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';

import { CbaWithdrawalService } from './cba-withdrawal.service';

// Finance's view of CBA withdrawals: approve or reject large ones, and move
// on any that are waiting on Monnify or the CBA.
@Controller('admin/finance/cba-withdrawals')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.FINANCE_OFFICER)
export class CbaWithdrawalsAdminController {
  constructor(private readonly withdrawals: CbaWithdrawalService) {}

  @Get()
  list(@Query('status') status?: string) {
    if (
      status &&
      !Object.values(CbaWithdrawalStatus).includes(status as CbaWithdrawalStatus)
    ) {
      throw new BadRequestException('Unknown withdrawal status');
    }

    return this.withdrawals.listForFinance(status as CbaWithdrawalStatus | undefined);
  }

  @Post(':withdrawalId/approve')
  approve(
    @Param('withdrawalId') withdrawalId: string,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    this.requireWriter(admin);
    return this.withdrawals.approve(withdrawalId, admin.sub);
  }

  @Post(':withdrawalId/reject')
  reject(
    @Param('withdrawalId') withdrawalId: string,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    this.requireWriter(admin);
    return this.withdrawals.reject(withdrawalId, admin.sub);
  }

  @Post(':withdrawalId/refresh')
  refresh(
    @Param('withdrawalId') withdrawalId: string,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    this.requireWriter(admin);
    return this.withdrawals.refresh(withdrawalId);
  }

  private requireWriter(admin: AdminJwtPayload) {
    if (admin.tier === AdminTier.AUDITOR) {
      throw new ForbiddenException('Auditor access is read-only');
    }
  }
}
