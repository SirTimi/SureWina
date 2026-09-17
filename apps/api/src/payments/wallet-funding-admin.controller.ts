import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminRole } from '@prisma/client';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';

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

  @Post(':fundingId/refresh')
  refresh(
    @Param('fundingId') fundingId: string,
    @Query('transactionId') transactionId?: string,
  ) {
    return this.funding.refreshForFinance(
      fundingId,
      transactionId,
    );
  }
}