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
import { MonnifyBanksService } from '../integrations/monnify/monnify-banks.service';

import { CbaWithdrawalService } from './cba-withdrawal.service';
import {
  WalletOwner,
  WithdrawalAccountService,
} from './withdrawal-account.service';
import {
  AddWithdrawalAccountDto,
  ChangeWalletPinDto,
  RequestWithdrawalDto,
  ResetWalletPinDto,
  SetWalletPinDto,
} from './dto/withdrawal.dto';
import { WalletPinService } from './wallet-pin.service';

// Customer withdrawals from CBA Winnings. Separate from the legacy
// `wallet/withdrawals` routes, which pay from the SureWina ledger.
@Controller('wallet')
@UseGuards(CustomerJwtGuard)
export class CustomerWithdrawalsController {
  constructor(
    private readonly wallets: WalletService,
    private readonly accounts: WithdrawalAccountService,
    private readonly withdrawals: CbaWithdrawalService,
    private readonly banks: MonnifyBanksService,
    private readonly pins: WalletPinService,
  ) {}

  // The banks a withdrawal account can be saved with: Monnify's list and
  // codes, since Monnify pays the withdrawal. Not `account/banks`, which is
  // Paystack's list for prize claims.
  @Get('withdrawal-banks')
  listBanks() {
    return this.banks.listBanks();
  }

  @Get('withdrawal-accounts')
  async listAccounts(@CurrentUser() user: CustomerJwtPayload) {
    return this.accounts.list(await this.owner(user));
  }

  @Post('withdrawal-accounts')
  async addAccount(
    @CurrentUser() user: CustomerJwtPayload,
    @Body() dto: AddWithdrawalAccountDto,
  ) {
    const owner = await this.owner(user);
    const { pin, ...input } = dto;

    await this.pins.verifyIfRequired(owner, pin);

    return this.accounts.add(owner, input);
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
    const owner = await this.owner(user);
    const { pin, ...input } = dto;

    await this.pins.verifyIfRequired(owner, pin);

    return this.withdrawals.request(owner, input);
  }

  // Withdrawal PIN: needed to withdraw and to save a bank account.
  @Get('pin')
  async pinStatus(@CurrentUser() user: CustomerJwtPayload) {
    return this.pins.status(await this.owner(user));
  }

  @Post('pin')
  async setPin(@CurrentUser() user: CustomerJwtPayload, @Body() dto: SetWalletPinDto) {
    return this.pins.set(await this.owner(user), dto.pin);
  }

  @Post('pin/change')
  async changePin(@CurrentUser() user: CustomerJwtPayload, @Body() dto: ChangeWalletPinDto) {
    return this.pins.change(await this.owner(user), dto.currentPin, dto.newPin);
  }

  // A forgotten PIN: reset with the BVN the wallet was verified with.
  @Post('pin/reset')
  async resetPin(@CurrentUser() user: CustomerJwtPayload, @Body() dto: ResetWalletPinDto) {
    return this.pins.reset(await this.owner(user), dto.bvn, dto.newPin);
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
