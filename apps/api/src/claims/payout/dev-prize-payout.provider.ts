import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrizePayoutStatus } from '@prisma/client';

import {
  InitiatePrizePayoutInput,
  PrizePayoutProvider,
  PrizePayoutProviderResult,
} from './prize-payout.provider';

@Injectable()
export class DevPrizePayoutProvider
  implements PrizePayoutProvider
{
  readonly providerCode = 'DEV';

  async initiate(
    input: InitiatePrizePayoutInput,
  ): Promise<PrizePayoutProviderResult> {
    /*
     * Deterministic reference.
     *
     * Re-running a dev payout with the same idempotency key produces
     * the same provider reference instead of pretending it is a brand
     * new transfer.
     */
    const reference = `DEV-PAYOUT-${input.idempotencyKey}`;

    return {
      provider: this.providerCode,
      reference,
      status: PrizePayoutStatus.SUCCEEDED,
      rawStatus: 'dev_success',
    };
  }

  async getStatus(
    reference: string,
  ): Promise<PrizePayoutProviderResult> {
    if (!reference.startsWith('DEV-PAYOUT-')) {
      throw new NotFoundException(
        'Dev payout reference not found',
      );
    }

    return {
      provider: this.providerCode,
      reference,
      status: PrizePayoutStatus.SUCCEEDED,
      rawStatus: 'dev_success',
    };
  }
}