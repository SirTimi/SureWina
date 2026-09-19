import { Module } from '@nestjs/common';
import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';
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

import {
  PRIZE_PAYOUT_PROVIDER,
} from './payout/prize-payout.provider';

import {
  DevPrizePayoutProvider,
} from './payout/dev-prize-payout.provider';

import {
  MonnifyPrizePayoutProvider,
} from './payout/monnify-prize-payout.provider';

import {
  FlutterwavePrizePayoutProvider,
} from './payout/flutterwave-prize-payout.provider';

import {
  PrizePayoutProviderRegistry,
} from './payout/prize-payout-provider.registry';

import {
  PrizePayoutFinalizationService,
} from './payout/prize-payout-finalization.service';

import {
  MonnifyPayoutSyncService,
} from './payout/monnify-payout-sync.service';

import {
  MonnifyWebhookSignatureGuard,
} from './payout/monnify-webhook-signature.guard';

import {
  MonnifyPayoutWebhookController,
} from './payout/monnify-payout-webhook.controller';

import { LedgerModule } from '../ledger/ledger.module';

import {
  PrizePayoutEngineService,
} from './payout/prize-payout-engine.service';

import {
  PrizePayoutAttemptFinalizationService,
} from './payout/prize-payout-attempt-finalization.service';

import { PrizePayoutSyncService } from './payout/prize-payout-sync.service';

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

    PrizePayoutFinalizationService,
    MonnifyPayoutSyncService,
    MonnifyWebhookSignatureGuard,
    PrizePayoutEngineService,
    PrizePayoutAttemptFinalizationService,
    PrizePayoutSyncService,

    /*
     * Legacy Phase 1 provider selector.
     *
     * Keep this temporarily because ClaimsService still depends on it.
     * Do NOT add Flutterwave here yet.
     *
     * Phase 6's PrizePayoutEngineService will replace this mechanism.
     */
    {
      provide: PRIZE_PAYOUT_PROVIDER,

      inject: [
        ConfigService,
        DevPrizePayoutProvider,
        MonnifyPrizePayoutProvider,
      ],

      useFactory: (
        config: ConfigService,
        devProvider:
          DevPrizePayoutProvider,
        monnifyProvider:
          MonnifyPrizePayoutProvider,
      ) => {
        const mode =
          config.get<string>(
            'PAYOUTS_MODE',
          ) ?? 'dev';

        if (mode === 'monnify') {
          return monnifyProvider;
        }

        return devProvider;
      },
    },
  ],

  exports: [
    ClaimsService,

    BankResolveService,
    WhtDeductionService,
    RedemptionService,

    PrizePayoutProviderRegistry,
    PrizePayoutEngineService
  ],
})
export class ClaimsModule {}