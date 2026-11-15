import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Matches } from 'class-validator';

import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { CustomerJwtPayload } from '../auth/auth.types';
import { AgentJwtGuard } from '../agent-auth/guards/agent-jwt.guard';
import { CurrentAgent } from '../agent-auth/guards/current-agent.decorator';
import { AgentJwtPayload } from '../agent-auth/agent-auth.types';
import { WalletService } from '../wallet/wallet.service';
import { WitmangoBalanceService } from '../integrations/witmango/witmango-balance.service';

import { FundingAccountService } from './funding-account.service';

export class AgentFundingAccountDto {
  // Checked against the agent's onboarding hash, then sent to Monnify for
  // the reservation. Never stored or logged.
  @Matches(/^\d{11}$/, { message: 'bvn must be exactly 11 digits' })
  bvn!: string;
}

// Customer: balances of the CBA wallet, read live.
@Controller('wallet/cba')
@UseGuards(CustomerJwtGuard)
export class CustomerCbaWalletController {
  constructor(
    private readonly wallets: WalletService,
    private readonly balances: WitmangoBalanceService,
  ) {}

  @Get('balances')
  async balancesForCustomer(@CurrentUser() user: CustomerJwtPayload) {
    const wallet = await this.wallets.getCustomerWallet(user.sub);
    return this.balances.getBalances(wallet.walletId);
  }
}

// Agent: Float and Earnings, and the account number to fund Float with.
@Controller('agent/wallet/cba')
@UseGuards(AgentJwtGuard)
export class AgentCbaWalletController {
  constructor(
    private readonly wallets: WalletService,
    private readonly balances: WitmangoBalanceService,
    private readonly funding: FundingAccountService,
  ) {}

  @Get()
  async view(@CurrentAgent() agent: AgentJwtPayload) {
    const wallet = await this.wallets.ensureAgentWallet(agent.sub);

    const [balances, funding] = await Promise.all([
      this.balances.getBalances(wallet.walletId),
      this.funding.getView(wallet.walletId),
    ]);

    return { ...balances, funding };
  }

  // Safe to submit more than once: an existing account is returned.
  @Post('funding-account')
  @HttpCode(200)
  async fundingAccount(
    @CurrentAgent() agent: AgentJwtPayload,
    @Body() dto: AgentFundingAccountDto,
  ) {
    const wallet = await this.wallets.ensureAgentWallet(agent.sub);

    return this.funding.ensureForAgent({
      agentId: agent.sub,
      walletId: wallet.walletId,
      bvn: dto.bvn,
    });
  }
}
