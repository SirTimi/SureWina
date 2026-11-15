import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { WitmangoModule } from '../integrations/witmango/witmango.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { ClaimsModule } from '../claims/claims.module';
import { WalletModule } from '../wallet/wallet.module';

import { CbaReconciliationService } from './cba-reconciliation.service';
import { CbaRecoveryService } from './cba-recovery.service';
import { CbaTransferResolutionService } from './cba-transfer-resolution.service';
import { CbaBalanceMigrationService } from './cba-balance-migration.service';
import { CbaReconciliationAdminController } from './cba-reconciliation-admin.controller';

// Daily vault-against-book reconciliation and the retry sweep for CBA
// wallets.
@Module({
  imports: [
    JwtModule.register({}),
    WitmangoModule,
    TreasuryModule,
    WithdrawalsModule,
    ClaimsModule,
    WalletModule,
  ],
  controllers: [CbaReconciliationAdminController],
  providers: [CbaReconciliationService, CbaRecoveryService, CbaTransferResolutionService, CbaBalanceMigrationService],
  exports: [CbaReconciliationService],
})
export class CbaReconciliationModule {}
