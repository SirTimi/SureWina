import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { WalletModule } from '../wallet/wallet.module';
import { MonnifyModule } from '../integrations/monnify/monnify.module';
import { WitmangoModule } from '../integrations/witmango/witmango.module';
import { ClaimsModule } from '../claims/claims.module';

import { WithdrawalAccountService } from './withdrawal-account.service';
import { CbaWithdrawalService } from './cba-withdrawal.service';
import { CustomerWithdrawalsController } from './customer-withdrawals.controller';
import { AgentWithdrawalsController } from './agent-withdrawals.controller';
import { CbaWithdrawalsAdminController } from './cba-withdrawals-admin.controller';

// Saved withdrawal accounts and withdrawals from CBA wallets.
@Module({
  imports: [
    JwtModule.register({}),
    WalletModule,
    MonnifyModule,
    WitmangoModule,
    // For the payout account cipher and the Monnify payout provider.
    ClaimsModule,
  ],
  controllers: [
    CustomerWithdrawalsController,
    AgentWithdrawalsController,
    CbaWithdrawalsAdminController,
  ],
  providers: [WithdrawalAccountService, CbaWithdrawalService],
  exports: [WithdrawalAccountService, CbaWithdrawalService],
})
export class WithdrawalsModule {}
