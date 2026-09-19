import {
  Module,
} from '@nestjs/common';

import { LedgerService } from './ledger.service';
import { PaymentAccountingService } from './payment-accounting.service';
import { LedgerBootstrapService } from './ledger-bootstrap.service';
import { LedgerAdminController } from './ledger-admin.controller';

@Module({
  controllers: [
    LedgerAdminController,
  ],

  providers: [
    LedgerService,
    LedgerBootstrapService,
    PaymentAccountingService,
  ],

  exports: [
    LedgerService,
    PaymentAccountingService,
  ],
})
export class LedgerModule {}