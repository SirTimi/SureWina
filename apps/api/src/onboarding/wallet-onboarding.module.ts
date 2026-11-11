import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { IdentityModule } from '../identity/identity.module';
import { WalletModule } from '../wallet/wallet.module';
import { WitmangoModule } from '../integrations/witmango/witmango.module';

import { WalletOnboardingController } from './wallet-onboarding.controller';
import { WalletOnboardingService } from './wallet-onboarding.service';

@Module({
  imports: [
    JwtModule.register({}),
    IdentityModule,
    WalletModule,
    WitmangoModule,
  ],
  controllers: [WalletOnboardingController],
  providers: [WalletOnboardingService],
})
export class WalletOnboardingModule {}