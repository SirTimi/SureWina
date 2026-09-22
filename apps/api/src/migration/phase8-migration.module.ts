import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module';
import { RequestContextModule } from '../common/request-context/request-context.module';
import { AuditModule } from '../audit/audit.module';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerBootstrapService } from '../ledger/ledger-bootstrap.service';
import { PaymentAccountingService } from '../ledger/payment-accounting.service';
import { WalletService } from '../wallet/wallet.service';
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
    RequestContextModule,
    AuditModule,
  ],
  providers: [
    LedgerService,
    LedgerBootstrapService,
    PaymentAccountingService,
    WalletService,
    TreasuryBootstrapService,
    Phase8MigrationService,
  ],
  exports: [
    Phase8MigrationService,
  ],
})
export class Phase8MigrationModule {}
