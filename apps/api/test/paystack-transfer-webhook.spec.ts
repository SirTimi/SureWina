import { BadRequestException } from '@nestjs/common';

import { PaystackWebhookService } from '../src/payments/webhook/paystack-webhook.service';

describe('Phase 6: Paystack transfer webhook dispatch', () => {
  const reference = 'sw-prize-11111111-1111-4111-8111-111111111111';

  function setup() {
    const purchases = { confirmAndCreateTickets: jest.fn() };
    const verification = { verifyPaystack: jest.fn() };
    const notifications = { enqueueTicketConfirmationSms: jest.fn() };
    const walletFunding = { confirmIfFunding: jest.fn() };
    const identity = { handleWebhook: jest.fn() };
    const payoutSync = {
      syncReference: jest.fn().mockResolvedValue({
        found: true,
        changed: false,
      }),
    };
    const service = new PaystackWebhookService(
      purchases as never,
      verification as never,
      notifications as never,
      walletFunding as never,
      identity as never,
      payoutSync as never,
    );
    return { service, purchases, verification, notifications, walletFunding, identity, payoutSync };
  }

  it.each(['transfer.success', 'transfer.failed', 'transfer.reversed'])(
    'routes %s by immutable reference instead of trusting webhook status',
    async (event) => {
      const h = setup();
      await h.service.handle({
        event,
        data: { reference, status: 'success' },
      });
      expect(h.payoutSync.syncReference).toHaveBeenCalledTimes(1);
      expect(h.payoutSync.syncReference).toHaveBeenCalledWith(
        'PAYSTACK', reference, 'paystack-transfer-webhook',
      );
      expect(h.verification.verifyPaystack).not.toHaveBeenCalled();
      expect(h.walletFunding.confirmIfFunding).not.toHaveBeenCalled();
      expect(h.purchases.confirmAndCreateTickets).not.toHaveBeenCalled();
      expect(h.notifications.enqueueTicketConfirmationSms).not.toHaveBeenCalled();
      expect(h.identity.handleWebhook).not.toHaveBeenCalled();
    },
  );

  it('rejects a transfer notification with no valid immutable reference', async () => {
    const h = setup();
    await expect(h.service.handle({
      event: 'transfer.success',
      data: { reference: '1' },
    })).rejects.toThrow(BadRequestException);
    expect(h.payoutSync.syncReference).not.toHaveBeenCalled();
  });

  it('does not manufacture a payout when an external reference is unknown', async () => {
    const h = setup();
    h.payoutSync.syncReference.mockResolvedValue({
      found: false, changed: false,
    });
    await h.service.handle({
      event: 'transfer.success',
      data: { reference },
    });
    expect(h.payoutSync.syncReference).toHaveBeenCalledTimes(1);
    expect(h.purchases.confirmAndCreateTickets).not.toHaveBeenCalled();
    expect(h.walletFunding.confirmIfFunding).not.toHaveBeenCalled();
  });

  it('does not swallow provider verification failure as a successful webhook delivery', async () => {
    const h = setup();
    h.payoutSync.syncReference.mockRejectedValue(new Error('lookup unavailable'));
    await expect(h.service.handle({
      event: 'transfer.failed',
      data: { reference },
    })).rejects.toThrow('lookup unavailable');
    expect(h.notifications.enqueueTicketConfirmationSms).not.toHaveBeenCalled();
  });

  it('dispatches duplicate notifications without initiating a fresh bank transfer', async () => {
    const h = setup();
    const event = { event: 'transfer.success', data: { reference } };
    await h.service.handle(event);
    await h.service.handle(event);
    expect(h.payoutSync.syncReference).toHaveBeenCalledTimes(2);
    expect(h.verification.verifyPaystack).not.toHaveBeenCalled();
    expect(h.purchases.confirmAndCreateTickets).not.toHaveBeenCalled();
  });
});
