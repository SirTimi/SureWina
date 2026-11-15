import type { ModuleRef } from '@nestjs/core';

import { MonnifyPayoutWebhookController } from '../src/claims/payout/monnify-payout-webhook.controller';
import type { MonnifyPayoutSyncService } from '../src/claims/payout/monnify-payout-sync.service';

describe('Monnify disbursement webhook routing', () => {
  function harness() {
    const sync = { syncReference: jest.fn(async () => ({ found: true, changed: true })) };
    const withdrawals = { syncByReference: jest.fn(async () => ({ found: true, changed: false })) };
    const moduleRef = { get: jest.fn(() => withdrawals) };
    const controller = new MonnifyPayoutWebhookController(
      sync as unknown as MonnifyPayoutSyncService,
      moduleRef as unknown as ModuleRef,
    );
    return { controller, sync, withdrawals };
  }

  it('sends a CBA withdrawal reference to the withdrawals module', async () => {
    const h = harness();

    const out = await h.controller.handleDisbursement({
      eventType: 'SUCCESSFUL_DISBURSEMENT',
      eventData: { reference: 'sw-wdr-1234', status: 'SUCCESS' },
    });

    expect(h.withdrawals.syncByReference).toHaveBeenCalledWith('sw-wdr-1234');
    expect(h.sync.syncReference).not.toHaveBeenCalled();
    expect(out).toMatchObject({ matched: true, changed: false });
  });

  it('keeps prize payout references on the existing path', async () => {
    const h = harness();

    await h.controller.handleDisbursement({
      eventType: 'SUCCESSFUL_DISBURSEMENT',
      eventData: { reference: 'sw-prize-1234' },
    });

    expect(h.sync.syncReference).toHaveBeenCalledWith('sw-prize-1234');
    expect(h.withdrawals.syncByReference).not.toHaveBeenCalled();
  });
});
