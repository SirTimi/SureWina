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

import { AgentJwtGuard } from '../agent-auth/guards/agent-jwt.guard';
import { CurrentAgent } from '../agent-auth/guards/current-agent.decorator';
import { AgentJwtPayload } from '../agent-auth/agent-auth.types';
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

// Agent withdrawals from CBA Earnings: commission and reimbursed prizes.
// Float is never withdrawable.
@Controller('agent')
@UseGuards(AgentJwtGuard)
export class AgentWithdrawalsController {
  constructor(
    private readonly wallets: WalletService,
    private readonly accounts: WithdrawalAccountService,
    private readonly withdrawals: CbaWithdrawalService,
    private readonly banks: MonnifyBanksService,
    private readonly pins: WalletPinService,
  ) {}

  // The banks a withdrawal account can be saved with: Monnify's list and
  // codes, since Monnify pays the withdrawal.
  @Get('banks')
  listBanks() {
    return this.banks.listBanks();
  }

  @Get('withdrawal-accounts')
  async listAccounts(@CurrentAgent() agent: AgentJwtPayload) {
    return this.accounts.list(await this.owner(agent));
  }

  @Post('withdrawal-accounts')
  async addAccount(
    @CurrentAgent() agent: AgentJwtPayload,
    @Body() dto: AddWithdrawalAccountDto,
  ) {
    const owner = await this.owner(agent);
    const { pin, ...input } = dto;

    await this.pins.verifyIfRequired(owner, pin);

    return this.accounts.add(owner, input);
  }

  @Delete('withdrawal-accounts/:withdrawalAccountId')
  async removeAccount(
    @CurrentAgent() agent: AgentJwtPayload,
    @Param('withdrawalAccountId') withdrawalAccountId: string,
  ) {
    return this.accounts.remove(await this.owner(agent), withdrawalAccountId);
  }

  @Get('withdrawals')
  async list(@CurrentAgent() agent: AgentJwtPayload) {
    return this.withdrawals.list(await this.owner(agent));
  }

  @Post('withdrawals')
  async request(
    @CurrentAgent() agent: AgentJwtPayload,
    @Body() dto: RequestWithdrawalDto,
  ) {
    const owner = await this.owner(agent);
    const { pin, ...input } = dto;

    await this.pins.verifyIfRequired(owner, pin);

    return this.withdrawals.request(owner, input);
  }

  // Withdrawal PIN: needed to withdraw and to save a bank account.
  @Get('wallet/pin')
  async pinStatus(@CurrentAgent() agent: AgentJwtPayload) {
    return this.pins.status(await this.owner(agent));
  }

  @Post('wallet/pin')
  async setPin(@CurrentAgent() agent: AgentJwtPayload, @Body() dto: SetWalletPinDto) {
    return this.pins.set(await this.owner(agent), dto.pin);
  }

  @Post('wallet/pin/change')
  async changePin(@CurrentAgent() agent: AgentJwtPayload, @Body() dto: ChangeWalletPinDto) {
    return this.pins.change(await this.owner(agent), dto.currentPin, dto.newPin);
  }

  // A forgotten PIN: reset with the BVN the wallet was verified with.
  @Post('wallet/pin/reset')
  async resetPin(@CurrentAgent() agent: AgentJwtPayload, @Body() dto: ResetWalletPinDto) {
    return this.pins.reset(await this.owner(agent), dto.bvn, dto.newPin);
  }

  private async owner(agent: AgentJwtPayload): Promise<WalletOwner> {
    const wallet = await this.wallets.ensureAgentWallet(agent.sub);

    return {
      walletId: wallet.walletId,
      ownerType: LedgerOwnerType.AGENT,
      ownerId: agent.sub,
      actor: { type: AuditActorType.AGENT, id: agent.sub },
    };
  }
}
