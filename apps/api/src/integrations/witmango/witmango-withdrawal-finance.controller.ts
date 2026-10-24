
import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';

import { AdminRole } from '@prisma/client';

import { AdminJwtGuard } from '../../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../../admin-auth/decorators/admin-roles.decorator';

import { WitmangoWithdrawalService } from './witmango-withdrawal.service';

@Controller('admin/finance/witmango/withdrawals')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.FINANCE_OFFICER)
export class WitmangoWithdrawalFinanceController {
  constructor(
    private readonly withdrawals: WitmangoWithdrawalService,
  ) {}

  @Get(':withdrawalId')
  inspect(
    @Param('withdrawalId') withdrawalId: string,
  ) {
    return this.withdrawals.financeInspect(withdrawalId);
  }
}
