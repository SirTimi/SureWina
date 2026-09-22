import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { LedgerModule } from '../ledger/ledger.module';
import { WalletModule } from '../wallet/wallet.module';
import { TreasuryBootstrapService } from '../treasury/treasury-bootstrap.service';

import { Phase8MigrationService } from './phase8-migration.service';

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
    AuditModule,
    LedgerModule,
    WalletModule,
  ],
  providers: [
    Phase8MigrationService,
    TreasuryBootstrapService,
  ],
  exports: [
    Phase8MigrationService,
  ],
})
export class Phase8MigrationModule {}
