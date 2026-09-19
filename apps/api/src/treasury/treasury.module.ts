import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ClaimsModule } from '../claims/claims.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MonnifyModule } from '../integrations/monnify/monnify.module';

import { TreasuryProviderService } from './treasury-provider.service';
import { TreasurySettlementService } from './treasury-settlement.service';
import { TreasuryReconciliationService } from './treasury-reconciliation.service';
import { TreasuryBootstrapService } from './treasury-bootstrap.service';
import { TreasuryRecoveryService } from './treasury-recovery.service';
import { TreasuryWebhookController } from './treasury-webhook.controller';
import { TreasuryAdminController } from './treasury-admin.controller';

@Module({
  imports: [
    ConfigModule,
    ClaimsModule,
    LedgerModule,
    MonnifyModule,
  ],
  controllers: [
    TreasuryWebhookController,
    TreasuryAdminController,
  ],
  providers: [
    TreasuryProviderService,
    TreasurySettlementService,
    TreasuryReconciliationService,
    TreasuryBootstrapService,
    TreasuryRecoveryService,
  ],
  exports: [
    TreasuryProviderService,
    TreasurySettlementService,
    TreasuryReconciliationService,
  ],
})
export class TreasuryModule {}
