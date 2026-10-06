import { PaymentStatus } from '@prisma/client';
import { PurchaseConfirmationService } from '../src/payments/purchase-confirmation.service';

import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { PaymentAccountingService } from '../src/ledger/payment-accounting.service';
import type { JackpotAccumulationService } from '../src/payments/jackpot-accumulation.service';
import type { JackpotOffersService } from '../src/payments/jackpot-offers.service';
import type { ReceiptService } from '../src/tickets/receipt.service';
import type { ZohoEmailProvider } from '../src/notifications/zoho-email.provider';

describe('PurchaseConfirmationService idempotency', () => {
  it('does not accumulate or issue another offer for an already-confirmed payment', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          txn_id: 'txn-1',
          status: PaymentStatus.CONFIRMED,
        },
      ]),
    };

    const prisma = {
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;

    const jackpotAccumulation = {
      recordDailyPurchase: jest.fn(),
    } as unknown as JackpotAccumulationService;

    const service = new PurchaseConfirmationService(
      prisma,
      {} as AuditService,
      {} as PaymentAccountingService,
      jackpotAccumulation,
      {} as JackpotOffersService,
      {} as ReceiptService,
      {} as ZohoEmailProvider,
    );

    const result = await service.confirmAndCreateTickets({
      reference: 'SW-PAY-DUPLICATE',
      // The idempotency gate returns before provider details are inspected.
      verifiedPayment: {} as never,
      rawEvent: {},
    });

    expect(result).toBeNull();
    expect(jackpotAccumulation.recordDailyPurchase).not.toHaveBeenCalled();
  });
});
