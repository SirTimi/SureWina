import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { ClaimsService } from './claims.service';
import { ClaimsController } from './claims.controller';
import { AdminClaimsController } from './admin-claims.controller';

import { BvnVerificationService } from './kyc/bvn-verification.service';
import { BankResolveService } from './kyc/bank-resolve.service';

import { WhtDeductionService } from './wht-deduction.service';

import { RedemptionService } from './redemption.service';
import { RedemptionController } from './redemption.controller';

import { MonnifyModule } from '../integrations/monnify/monnify.module';
import { LedgerModule } from '../ledger/ledger.module';

import { DevPrizePayoutProvider } from './payout/dev-prize-payout.provider';

import { MonnifyPrizePayoutProvider } from './payout/monnify-prize-payout.provider';

import { FlutterwavePrizePayoutProvider } from './payout/flutterwave-prize-payout.provider';

import { PrizePayoutProviderRegistry } from './payout/prize-payout-provider.registry';

import { PrizePayoutAttemptFinalizationService } from './payout/prize-payout-attempt-finalization.service';

import { PrizePayoutEngineService } from './payout/prize-payout-engine.service';

import { PrizePayoutSyncService } from './payout/prize-payout-sync.service';

import { PrizePayoutRecoveryService } from './payout/prize-payout-recovery.service';

import { MonnifyPayoutSyncService } from './payout/monnify-payout-sync.service';

import { MonnifyWebhookSignatureGuard } from './payout/monnify-webhook-signature.guard';

import { MonnifyPayoutWebhookController } from './payout/monnify-payout-webhook.controller';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    MonnifyModule,
    LedgerModule,
  ],

  controllers: [
    ClaimsController,
    AdminClaimsController,
    RedemptionController,
    MonnifyPayoutWebhookController,
  ],

  providers: [
    ClaimsService,

    BvnVerificationService,
    BankResolveService,

    WhtDeductionService,
    RedemptionService,

    DevPrizePayoutProvider,
    MonnifyPrizePayoutProvider,
    FlutterwavePrizePayoutProvider,

    PrizePayoutProviderRegistry,

    PrizePayoutAttemptFinalizationService,
    PrizePayoutEngineService,
    PrizePayoutSyncService,
    PrizePayoutRecoveryService,

    MonnifyPayoutSyncService,
    MonnifyWebhookSignatureGuard,
  ],

  exports: [
    ClaimsService,
    BankResolveService,
    WhtDeductionService,
    RedemptionService,

    PrizePayoutProviderRegistry,
    PrizePayoutEngineService,
    PrizePayoutSyncService,
    MonnifyWebhookSignatureGuard,
  ],
})
export class ClaimsModule {}