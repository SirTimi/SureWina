import { Module } from '@nestjs/common';

import { WalletModule } from '../../wallet/wallet.module';
import { AuditModule } from '../../audit/audit.module';

import { WitmangoClientService } from './witmango-client.service';
import { WitmangoWalletLinkService } from './witmango-wallet-link.service';

@Module({
  imports: [
    WalletModule,
    AuditModule,
  ],

  providers: [
    WitmangoClientService,
    WitmangoWalletLinkService,
  ],

  exports: [
    WitmangoClientService,
    WitmangoWalletLinkService,
  ],
})
export class WitmangoModule {}