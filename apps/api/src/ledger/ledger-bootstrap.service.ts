import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';

import { LedgerService } from './ledger.service';

import {
  SYSTEM_LEDGER_ACCOUNTS,
} from './ledger.constants';

@Injectable()
export class LedgerBootstrapService
  implements OnModuleInit
{
  private readonly logger =
    new Logger(
      LedgerBootstrapService.name,
    );

  constructor(
    private readonly ledger:
      LedgerService,
  ) {}

  async onModuleInit() {
    for (
      const account of
      SYSTEM_LEDGER_ACCOUNTS
    ) {
      await this.ledger.ensureAccount({
        ...account,

        ownerId:
          null,

        currency:
          'NGN',
      });
    }

    this.logger.log(
      `Ledger chart ready (${SYSTEM_LEDGER_ACCOUNTS.length} system accounts)`,
    );
  }
}