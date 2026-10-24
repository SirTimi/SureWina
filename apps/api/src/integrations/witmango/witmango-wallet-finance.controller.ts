
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AdminRole } from '@prisma/client';

import { AdminJwtGuard } from '../../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../../admin-auth/admin-auth.types';

import { WitmangoWalletLinkService } from './witmango-wallet-link.service';
import { ProvisionWitmangoWalletDto } from './dto/provision-witmango-wallet.dto';

@Controller('admin/finance/witmango/wallets')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.FINANCE_OFFICER)
export class WitmangoWalletFinanceController {
  constructor(
    private readonly links: WitmangoWalletLinkService,
  ) {}

  @Get(':walletId')
  getLink(
    @Param('walletId') walletId: string,
  ) {
    return this.links.getLink(walletId);
  }

  @Get(':walletId/reconcile')
  reconcile(
    @Param('walletId') walletId: string,
  ) {
    return this.links.reconcile(walletId);
  }

  @Post(':walletId/provision')
  provision(
    @Param('walletId') walletId: string,
    @Body() dto: ProvisionWitmangoWalletDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.links.provisionCustomer(
      walletId,
      dto,
      admin.sub,
    );
  }
}
