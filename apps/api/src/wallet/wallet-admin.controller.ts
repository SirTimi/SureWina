import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AdminRole } from '@prisma/client';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';

import { WalletService } from './wallet.service';

class WalletStatusReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}

@Controller('admin/finance/wallets')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.FINANCE_OFFICER)
export class WalletAdminController {
  constructor(private readonly wallets: WalletService) {}

  @Post('customers/:userId/provision')
  provisionCustomer(@Param('userId') userId: string) {
    return this.wallets.ensureCustomerWallet(userId);
  }

  @Post('agents/:agentId/provision')
  provisionAgent(@Param('agentId') agentId: string) {
    return this.wallets.ensureAgentWallet(agentId);
  }

  @Get(':walletId')
  wallet(@Param('walletId') walletId: string) {
    return this.wallets.getWallet(walletId);
  }

  @Get(':walletId/history')
  history(
    @Param('walletId') walletId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.wallets.history(
      walletId,
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }

  @Post(':walletId/freeze')
  freeze(
    @Param('walletId') walletId: string,
    @Body() dto: WalletStatusReasonDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.wallets.freezeWallet(walletId, admin.sub, dto.reason);
  }

  @Post(':walletId/unfreeze')
  unfreeze(
    @Param('walletId') walletId: string,
    @Body() dto: WalletStatusReasonDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.wallets.unfreezeWallet(walletId, admin.sub, dto.reason);
  }

  @Post(':walletId/close')
  close(
    @Param('walletId') walletId: string,
    @Body() dto: WalletStatusReasonDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.wallets.closeWallet(walletId, admin.sub, dto.reason);
  }
}