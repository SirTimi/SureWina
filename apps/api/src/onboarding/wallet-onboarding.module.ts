import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { IdentityModule } from '../identity/identity.module';
import { WalletModule } from '../wallet/wallet.module';
import { WitmangoModule } from '../integrations/witmango/witmango.module';
import { MonnifyModule } from '../integrations/monnify/monnify.module';

import { WalletOnboardingController } from './wallet-onboarding.controller';
import { WalletOnboardingService } from './wallet-onboarding.service';
import { FundingAccountService } from './funding-account.service';

@Module({
  imports: [
    JwtModule.register({}),
    IdentityModule,
    WalletModule,
    WitmangoModule,
    MonnifyModule,
  ],
  controllers: [WalletOnboardingController],
  providers: [WalletOnboardingService, FundingAccountService],
})
export class WalletOnboardingModule {}