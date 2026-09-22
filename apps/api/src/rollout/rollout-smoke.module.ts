import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditModule } from '../audit/audit.module';
import { RequestContextModule } from '../common/request-context/request-context.module';
import { DatabaseModule } from '../database/database.module';
import { LedgerBootstrapService } from '../ledger/ledger-bootstrap.service';
import { LedgerService } from '../ledger/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { RolloutSmokeService } from './rollout-smoke.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '../../.env.local',
        '../../.env',
        '.env.local',
        '.env',
      ],
    }),
    DatabaseModule,
    RequestContextModule,
    AuditModule,
  ],
  providers: [
    LedgerService,
    LedgerBootstrapService,
    WalletService,
    RolloutSmokeService,
  ],
  exports: [RolloutSmokeService],
})
export class RolloutSmokeModule {}
