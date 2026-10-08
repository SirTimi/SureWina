import { NotificationsWorker } from '../../worker/src/notifications.worker';
import { jackpotOfferUnlocked, smsPlan } from '../../worker/src/sms-templates';
import type { JackpotOfferSmsJob } from '../../worker/src/queue.contract';

const offerId = '11111111-1111-4111-8111-111111111111';
const buyerPhone = '+2348012345678';
const scheduledAt = new Date(Date.now() + 86_400_000);
const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

function harness() {
  const offer = {
    offerId,
    buyerPhone,
    status: 'AVAILABLE',
    offerSmsSentAt: null as Date | null,
    offerPriceNgn: 500,
    originalPriceNgn: 5000,
    expiresAt,
    unlockedByPaymentTxnId: 'agent-txn-1',
    jackpotDraw: { scheduledAt },
  };
  const purchase = {
    buyerPhone,
    gateway: 'AGENT_CASH',
    status: 'CONFIRMED',
  };
  const prisma = {
    jackpotDiscountOffer: {
      findUnique: jest.fn(async () => offer),
      updateMany: jest.fn(async () => {
        offer.offerSmsSentAt = new Date();
        return { count: 1 };
      }),
    },
    paymentTransaction: {
      findUnique: jest.fn(async () => purchase),
    },
    user: {
      findUnique: jest.fn(async () => ({
        smsEnabled: true,
        selfExclusionUntil: null,
      })),
    },
    blockedPhone: {
      findUnique: jest.fn(async () => null),
    },
  };
  const sms = { sendSms: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const worker = new NotificationsWorker(
    config as never,
    prisma as never,
    sms as never,
  );
  const data: JackpotOfferSmsJob = {
    offerId,
    buyerPhone,
    offerPriceNgn: 500,
    normalPriceNgn: 5000,
    jackpotScheduledAt: scheduledAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const deliver = (job = data) =>
    (worker as unknown as {
      handleJackpotOffer: (data: JackpotOfferSmsJob) => Promise<void>;
    }).handleJackpotOffer(job);
  return { offer, purchase, prisma, sms, data, deliver };
}

describe('Jackpot offer notification replacement', () => {
  it('sends an idempotently identified offer notice, not a free-entry notice', async () => {
    const h = harness();
    await h.deliver();

    expect(h.sms.sendSms).toHaveBeenCalledWith(
      buyerPhone,
      expect.stringContaining('N500'),
      `offer-${offerId}`,
    );
    const copy = h.sms.sendSms.mock.calls[0][1] as string;
    expect(copy).toContain('N5,000');
    expect(copy).toContain('surewina.com/jackpot-offers/claim');
    expect(copy).not.toMatch(/free jackpot entry|free entries/i);
    expect(copy).not.toContain(offerId);
    expect(h.prisma.jackpotDiscountOffer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { offerId, offerSmsSentAt: null },
      }),
    );
    expect(smsPlan(copy).segments).toBe(1);
  });

  it('does not notify for an unconfirmed or non-agent origin', async () => {
    const h = harness();
    h.purchase.status = 'PENDING';
    await h.deliver();
    expect(h.sms.sendSms).not.toHaveBeenCalled();
  });

  it('does not notify after expiry or a previous delivery', async () => {
    const h = harness();
    h.offer.offerSmsSentAt = new Date();
    await h.deliver();
    expect(h.sms.sendSms).not.toHaveBeenCalled();
  });

  it('rejects stale or spoofed queue pricing', async () => {
    const h = harness();
    await expect(h.deliver({
      ...h.data,
      offerPriceNgn: 1,
    })).rejects.toThrow('notification payload mismatch');
    expect(h.sms.sendSms).not.toHaveBeenCalled();
  });

  it('keeps claim link and prices separate from a purchase authorisation', () => {
    const copy = jackpotOfferUnlocked({
      offerPriceNgn: 500,
      normalPriceNgn: 5000,
      expiresAt,
      claimUrl: 'https://surewina.com/jackpot-offers/claim',
    });
    expect(copy).toContain('Verify phone:');
    expect(copy).not.toContain('SW-PAY-');
    expect(copy).not.toContain(offerId);
    expect(smsPlan(copy).segments).toBe(1);
  });
});
