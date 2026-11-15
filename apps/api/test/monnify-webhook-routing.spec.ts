import { MonnifyWebhookService } from '../src/payments/webhook/monnify-webhook.service';

describe('MonnifyWebhookService routing', () => {
  function setup() {
    const purchaseConfirmation = {
      confirmAndCreateTickets: jest.fn().mockResolvedValue(null),
    };
    const verification = { verifyMonnify: jest.fn().mockResolvedValue(null) };
    const walletFunding = { confirmIfFunding: jest.fn().mockResolvedValue(null) };
    const notificationQueue = { enqueueTicketConfirmationSms: jest.fn() };
    const topUps = {
      isReservedAccountEvent: jest.fn(),
      handle: jest.fn().mockResolvedValue(undefined),
    };

    const service = new MonnifyWebhookService(
      purchaseConfirmation as never,
      verification as never,
      walletFunding as never,
      notificationQueue as never,
      topUps as never,
    );

    return { service, verification, walletFunding, purchaseConfirmation, topUps };
  }

  const reservedEvent = {
    eventType: 'SUCCESSFUL_TRANSACTION',
    eventData: {
      paymentReference: 'MNFY|20261111|000001',
      transactionReference: 'MNFY|20261111|000001',
      product: { type: 'RESERVED_ACCOUNT', reference: 'SW-WAL-abc' },
    },
  };

  it('sends a reserved account transfer down its own path only', async () => {
    const h = setup();
    h.topUps.isReservedAccountEvent.mockReturnValue(true);

    await h.service.handle(reservedEvent);

    expect(h.topUps.handle).toHaveBeenCalledWith(reservedEvent);
    // The customer-initiated path must not also run for the same money.
    expect(h.verification.verifyMonnify).not.toHaveBeenCalled();
    expect(h.walletFunding.confirmIfFunding).not.toHaveBeenCalled();
    expect(h.purchaseConfirmation.confirmAndCreateTickets).not.toHaveBeenCalled();
  });

  it('leaves every other payment on the existing path', async () => {
    const h = setup();
    h.topUps.isReservedAccountEvent.mockReturnValue(false);

    await h.service.handle({
      eventType: 'SUCCESSFUL_TRANSACTION',
      eventData: { paymentReference: 'sw-pay-123' },
    });

    expect(h.topUps.handle).not.toHaveBeenCalled();
    expect(h.verification.verifyMonnify).toHaveBeenCalledWith('sw-pay-123');
  });

  it('still acknowledges the webhook if the top-up path throws', async () => {
    const h = setup();
    h.topUps.isReservedAccountEvent.mockReturnValue(true);
    h.topUps.handle.mockRejectedValue(new Error('database unavailable'));

    await expect(h.service.handle(reservedEvent)).resolves.toBeUndefined();
  });

  it('ignores events that are not successful transactions', async () => {
    const h = setup();

    await h.service.handle({ eventType: 'SUCCESSFUL_REFUND', eventData: {} });

    expect(h.topUps.isReservedAccountEvent).not.toHaveBeenCalled();
    expect(h.topUps.handle).not.toHaveBeenCalled();
  });
});