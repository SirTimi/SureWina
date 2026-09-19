import { Injectable } from '@nestjs/common';
import { PrizePayoutSyncService } from './prize-payout-sync.service';

@Injectable()
export class MonnifyPayoutSyncService {
  constructor(
    private readonly payoutSync: PrizePayoutSyncService,
  ) {}

  syncReference(reference: string) {
    return this.payoutSync.syncReference(
      'MONNIFY',
      reference,
      'monnify-disbursement-sync',
    );
  }
}