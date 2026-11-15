import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuditActorType, LedgerOwnerType } from '@prisma/client';

import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { CustomerJwtPayload } from '../auth/auth.types';
import { WalletService } from '../wallet/wallet.service';

import { CbaWithdrawalService } from './cba-withdrawal.service';
import {
  WalletOwner,
  WithdrawalAccountService,
} from './withdrawal-account.service';
import {
  AddWithdrawalAccountDto,
  RequestWithdrawalDto,
} from './dto/withdrawal.dto';

// Customer withdrawals from CBA Winnings. Separate from the legacy
// `wallet/withdrawals` routes, which pay from the SureWina ledger.
@Controller('wallet')
@UseGuards(CustomerJwtGuard)
export class CustomerWithdrawalsController {
  constructor(
    private readonly wallets: WalletService,
    private readonly accounts: WithdrawalAccountService,
    private readonly withdrawals: CbaWithdrawalService,
  ) {}

  @Get('withdrawal-accounts')
  async listAccounts(@CurrentUser() user: CustomerJwtPayload) {
    return this.accounts.list(await this.owner(user));
  }

  @Post('withdrawal-accounts')
  async addAccount(
    @CurrentUser() user: CustomerJwtPayload,
    @Body() dto: AddWithdrawalAccountDto,
  ) {
    return this.accounts.add(await this.owner(user), dto);
  }

  @Delete('withdrawal-accounts/:withdrawalAccountId')
  async removeAccount(
    @CurrentUser() user: CustomerJwtPayload,
    @Param('withdrawalAccountId') withdrawalAccountId: string,
  ) {
    return this.accounts.remove(await this.owner(user), withdrawalAccountId);
  }

  @Get('cba-withdrawals')
  async list(@CurrentUser() user: CustomerJwtPayload) {
    return this.withdrawals.list(await this.owner(user));
  }

  @Post('cba-withdrawals')
  async request(
    @CurrentUser() user: CustomerJwtPayload,
    @Body() dto: RequestWithdrawalDto,
  ) {
    return this.withdrawals.request(await this.owner(user), dto);
  }

  private async owner(user: CustomerJwtPayload): Promise<WalletOwner> {
    const wallet = await this.wallets.getCustomerWallet(user.sub);

    return {
      walletId: wallet.walletId,
      ownerType: LedgerOwnerType.CUSTOMER,
      ownerId: user.sub,
      actor: { type: AuditActorType.CUSTOMER, id: user.sub },
    };
  }
}
