import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminRole, AdminTier } from '@prisma/client';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';

import { WalletFundingService } from './wallet-funding.service';

@Controller('admin/finance/wallet-funding')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.FINANCE_OFFICER)
export class WalletFundingAdminController {
  constructor(private readonly funding: WalletFundingService) {}

  @Get('review')
  reviewRequired() {
    return this.funding.listReviewRequired();
  }

  @Get('wallet/:walletId/history')
  history(
    @Param('walletId') walletId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.funding.historyForFinanceWallet(
      walletId,
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }

  @Post(':fundingId/refresh')
  refresh(
    @Param('fundingId') fundingId: string,
    @Query('transactionId') transactionId: string | undefined,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    if (admin.tier === AdminTier.AUDITOR) {
      throw new ForbiddenException(
        'Auditor access is read-only',
      );
    }

    return this.funding.refreshForFinance(
      fundingId,
      transactionId,
    );
  }
}