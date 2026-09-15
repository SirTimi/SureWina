import { Module } from '@nestjs/common';

import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';

import {
  JwtModule,
} from '@nestjs/jwt';

import {
  ClaimsService,
} from './claims.service';

import {
  ClaimsController,
} from './claims.controller';

import {
  AdminClaimsController,
} from './admin-claims.controller';

import {
  BvnVerificationService,
} from './kyc/bvn-verification.service';

import {
  BankResolveService,
} from './kyc/bank-resolve.service';

import {
  WhtDeductionService,
} from './wht-deduction.service';

import {
  RedemptionService,
} from './redemption.service';

import {
  RedemptionController,
} from './redemption.controller';

import {
  MonnifyModule,
} from '../integrations/monnify/monnify.module';

import {
  PRIZE_PAYOUT_PROVIDER,
} from './payout/prize-payout.provider';

import {
  DevPrizePayoutProvider,
} from './payout/dev-prize-payout.provider';

import {
  MonnifyPrizePayoutProvider,
} from './payout/monnify-prize-payout.provider';

@Module({
  imports: [
    ConfigModule,

    JwtModule.register({}),

    MonnifyModule,
  ],

  controllers: [
    ClaimsController,
    AdminClaimsController,
    RedemptionController,
  ],

  providers: [
    ClaimsService,

    BvnVerificationService,
    BankResolveService,

    WhtDeductionService,
    RedemptionService,

    DevPrizePayoutProvider,
    MonnifyPrizePayoutProvider,

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
  ],
})
export class ClaimsModule {}