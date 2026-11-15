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
import { BankResolveService } from '../claims/kyc/bank-resolve.service';

import { CbaWithdrawalService } from './cba-withdrawal.service';
import {
  WalletOwner,
  WithdrawalAccountService,
} from './withdrawal-account.service';
import {
  AddWithdrawalAccountDto,
  RequestWithdrawalDto,
} from './dto/withdrawal.dto';

// Agent withdrawals from CBA Earnings: commission and reimbursed prizes.
// Float is never withdrawable.
@Controller('agent')
@UseGuards(AgentJwtGuard)
export class AgentWithdrawalsController {
  constructor(
    private readonly wallets: WalletService,
    private readonly accounts: WithdrawalAccountService,
    private readonly withdrawals: CbaWithdrawalService,
    private readonly banks: BankResolveService,
  ) {}

  // The bank list for choosing a withdrawal account. The customer route for
  // it is customer-only.
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
    return this.accounts.add(await this.owner(agent), dto);
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
    return this.withdrawals.request(await this.owner(agent), dto);
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
