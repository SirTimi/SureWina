import {
  Module,
} from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';

import { LedgerService } from './ledger.service';
import { PaymentAccountingService } from './payment-accounting.service';
import { LedgerBootstrapService } from './ledger-bootstrap.service';
import { LedgerAdminController } from './ledger-admin.controller';

@Module({
  imports: [
    JwtModule.register({}),
  ],

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