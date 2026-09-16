import {
  Module,
} from '@nestjs/common';

import { LedgerService } from './ledger.service';
import { LedgerBootstrapService } from './ledger-bootstrap.service';
import { LedgerAdminController } from './ledger-admin.controller';

@Module({
  controllers: [
    LedgerAdminController,
  ],

  providers: [
    LedgerService,
    LedgerBootstrapService,
  ],

  exports: [
    LedgerService,
  ],
})
export class LedgerModule {}