import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import {
  DevPrizePayoutProvider,
} from './dev-prize-payout.provider';

import {
  FlutterwavePrizePayoutProvider,
} from './flutterwave-prize-payout.provider';

import {
  MonnifyPrizePayoutProvider,
} from './monnify-prize-payout.provider';

import {
  PrizePayoutProvider,
  PrizePayoutProviderCode,
} from './prize-payout.provider';

@Injectable()
export class PrizePayoutProviderRegistry {
  private readonly providers:
    ReadonlyMap<
      PrizePayoutProviderCode,
      PrizePayoutProvider
    >;

  constructor(
    dev:
      DevPrizePayoutProvider,

    monnify:
      MonnifyPrizePayoutProvider,

    flutterwave:
      FlutterwavePrizePayoutProvider,
  ) {
    this.providers =
      new Map<
        PrizePayoutProviderCode,
        PrizePayoutProvider
      >([
        [
          dev.providerCode,
          dev,
        ],
        [
          monnify.providerCode,
          monnify,
        ],
        [
          flutterwave.providerCode,
          flutterwave,
        ],
      ]);
  }

  get(
    providerCode: string,
  ): PrizePayoutProvider {
    const normalized =
      providerCode
        .trim()
        .toUpperCase() as
        PrizePayoutProviderCode;

    const provider =
      this.providers.get(
        normalized,
      );

    if (!provider) {
      throw new BadRequestException(
        `Unsupported prize payout provider: ${providerCode}`,
      );
    }

    return provider;
  }

  has(
    providerCode: string,
  ): boolean {
    const normalized =
      providerCode
        .trim()
        .toUpperCase() as
        PrizePayoutProviderCode;

    return this.providers.has(
      normalized,
    );
  }

  codes():
    PrizePayoutProviderCode[] {
    return [
      ...this.providers.keys(),
    ];
  }
}