import {
  DrawStatus,
  DrawType,
  LedgerAccountPurpose,
  LedgerEntrySide,
  LedgerTransactionKind,
  PaymentGateway,
  PaymentStatus,
  TicketStatus,
  WalletHoldStatus,
  WalletPurchaseStatus,
} from '@prisma/client';

import { DrawsService } from '../src/draws/draws.service';
import { RolloutCheckService } from '../src/rollout/rollout-check.service';

import type { AuditService } from '../src/audit/audit.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { ConfigService } from '@nestjs/config';

describe('Phase 5 ticket value and accounting', () => {
  it('uses summed ticket face values for mixed-price jackpot stake', async () => {
    const draw = {
      drawId: 'draw-jackpot',
      drawCode: 'RD-DRAW-20261010-JACKPOT',
      drawType: DrawType.SATURDAY_JACKPOT,
      status: DrawStatus.ACTIVE,
      prizeDescription: 'Saturday Jackpot',
      prizeValueNgn: 1_000_000,
      prizeImageUrl: null,
      ticketPriceNgn: 5_000,
      ticketQuota: null,
      scheduledAt: new Date('2026-10-10T19:00:00.000Z'),
      cutoffAt: new Date('2026-10-10T18:00:00.000Z'),
      configVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      seedCommit: null,
    };

    const prisma = {
      draw: {
        findUnique: jest.fn().mockResolvedValue(draw),
      },
      ticket: {
        count: jest.fn().mockResolvedValue(2),
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            faceValueNgn: 5_500,
          },
        }),
      },
    } as unknown as PrismaService;

    const service = new DrawsService(
      prisma,
      {} as AuditService,
    );

    const result = await service.getByCode(
      draw.drawCode,
    );

    expect(result.draw.ticketPriceNgn).toBe(5_000);
    expect(result.ticketsSold).toBe(2);
    expect(result.prizePoolNgn).toBe(5_500);

    expect(
      (prisma as unknown as {
        ticket: {
          count: jest.Mock;
          aggregate: jest.Mock;
        };
      }).ticket.count,
    ).toHaveBeenCalledWith({
      where: {
        drawId: draw.drawId,
        status: TicketStatus.ACTIVE,
      },
    });

    expect(
      (prisma as unknown as {
        ticket: {
          count: jest.Mock;
          aggregate: jest.Mock;
        };
      }).ticket.aggregate,
    ).toHaveBeenCalledWith({
      where: {
        drawId: draw.drawId,
        status: TicketStatus.ACTIVE,
      },
      _sum: {
        faceValueNgn: true,
      },
    });
  });

  it('accepts mixed NGN 5,000 and NGN 500 provider tickets when collection and revenue match face values', async () => {
    const providerRows = [
      providerPurchase(
        'txn-normal',
        5_000,
      ),
      providerPurchase(
        'txn-promo',
        500,
      ),
    ];

    const prisma = {
      paymentTransaction: {
        findMany: jest.fn().mockResolvedValue(
          providerRows,
        ),
      },
    } as unknown as PrismaService;

    const service = new RolloutCheckService(
      prisma,
      {} as ConfigService,
    );

    const result =
      await (
        service as unknown as {
          checkPaymentCollections(): Promise<{
            status: string;
            summary: string;
          }>;
        }
      ).checkPaymentCollections();

    expect(result.status).toBe('PASS');
    expect(result.summary).toContain(
      'face-value totals equal to collected amounts',
    );
  });

  it('accepts mixed NGN 5,000 and NGN 500 wallet tickets when wallet debit, hold, revenue and face values reconcile', async () => {
    const walletRows = [
      walletPurchase(
        'wallet-normal',
        5_000,
      ),
      walletPurchase(
        'wallet-promo',
        500,
      ),
    ];

    const prisma = {
      walletPurchase: {
        findMany: jest.fn().mockResolvedValue(
          walletRows,
        ),
        count: jest.fn().mockResolvedValue(0),
      },
      walletHold: {
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService;

    const service = new RolloutCheckService(
      prisma,
      {} as ConfigService,
    );

    const result =
      await (
        service as unknown as {
          checkWalletPurchases(): Promise<{
            status: string;
            summary: string;
          }>;
        }
      ).checkWalletPurchases();

    expect(result.status).toBe('PASS');
    expect(result.summary).toContain(
      'ticket face values',
    );
  });
});

function providerPurchase(
  txnId: string,
  amountNgn: number,
) {
  return {
    txnId,
    gateway:
      PaymentGateway.PAYSTACK,
    status:
      PaymentStatus.CONFIRMED,
    amountNgn,
    ticketCount: 1,
    collectionLedgerTxnId:
      `ledger-${txnId}`,
    tickets: [
      {
        faceValueNgn:
          amountNgn,
      },
    ],
    collectionLedgerTxn: {
      kind:
        LedgerTransactionKind.PROVIDER_COLLECTION,
      referenceType:
        'PaymentTransaction',
      referenceId:
        txnId,
      entries: [
        {
          side:
            LedgerEntrySide.DEBIT,
          amountNgn,
          account: {
            purpose:
              LedgerAccountPurpose.PSP_CLEARING,
          },
        },
        {
          side:
            LedgerEntrySide.CREDIT,
          amountNgn,
          account: {
            purpose:
              LedgerAccountPurpose.TICKET_SALES_REVENUE,
          },
        },
      ],
    },
  };
}

function walletPurchase(
  purchaseId: string,
  amountNgn: number,
) {
  const buyerUserId =
    'customer-1';

  return {
    purchaseId,
    buyerUserId,
    amountNgn,
    ticketCount: 1,
    completedAt:
      new Date(),
    holdId:
      `hold-${purchaseId}`,
    tickets: [
      {
        faceValueNgn:
          amountNgn,
      },
    ],
    status:
      WalletPurchaseStatus.COMPLETED,
    hold: {
      holdId:
        `hold-${purchaseId}`,
      status:
        WalletHoldStatus.CAPTURED,
      amountNgn,
      captureLedgerTxnId:
        `capture-${purchaseId}`,
      holdLedgerTxn: {
        kind:
          LedgerTransactionKind.WALLET_HOLD,
        referenceType:
          'WalletPurchase',
        referenceId:
          purchaseId,
        entries: [
          {
            side:
              LedgerEntrySide.DEBIT,
            amountNgn,
            account: {
              purpose:
                LedgerAccountPurpose.CUSTOMER_AVAILABLE,
              ownerId:
                buyerUserId,
            },
          },
          {
            side:
              LedgerEntrySide.CREDIT,
            amountNgn,
            account: {
              purpose:
                LedgerAccountPurpose.CUSTOMER_HELD,
              ownerId:
                buyerUserId,
            },
          },
        ],
      },
      captureLedgerTxn: {
        kind:
          LedgerTransactionKind.PURCHASE,
        referenceType:
          'WalletPurchase',
        referenceId:
          purchaseId,
        entries: [
          {
            side:
              LedgerEntrySide.DEBIT,
            amountNgn,
            account: {
              purpose:
                LedgerAccountPurpose.CUSTOMER_HELD,
              ownerId:
                buyerUserId,
            },
          },
          {
            side:
              LedgerEntrySide.CREDIT,
            amountNgn,
            account: {
              purpose:
                LedgerAccountPurpose.TICKET_SALES_REVENUE,
              ownerId:
                null,
            },
          },
        ],
      },
    },
  };
}
