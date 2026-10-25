import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module';
import { LedgerService } from './ledger.service';
import { LedgerBootstrapService } from './ledger-bootstrap.service';

/**
 * Standalone bootstrap context, deliberately excluding controllers, queues,
 * payout providers and the Phase 8 migration state machine.
 */
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
  ],
  providers: [
    LedgerService,
    LedgerBootstrapService,
  ],
})
export class LedgerBootstrapCommandModule {}
