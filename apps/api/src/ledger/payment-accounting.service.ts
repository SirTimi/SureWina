import {
  ConflictException,
  Injectable,
} from '@nestjs/common';

import {
  LedgerEntrySide,
  LedgerTransactionKind,
  PaymentGateway,
  Prisma,
} from '@prisma/client';

import { LedgerService } from './ledger.service';
import { SYSTEM_LEDGER_ACCOUNT_CODES } from './ledger.constants';

export type ProviderCollectionDisposition =
  | 'REVENUE'
  | 'SUSPENSE';

@Injectable()
export class PaymentAccountingService {
  constructor(
    private readonly ledger: LedgerService,
  ) {}

  async recordProviderCollectionInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      paymentTxnId: string;
      gateway: PaymentGateway;
      amountNgn: number;
      disposition: ProviderCollectionDisposition;
      providerReference: string;
      providerTransactionId?: string | null;
      occurredAt?: Date;
    },
  ) {
    const payment =
      await tx.paymentTransaction.findUniqueOrThrow({
        where: {
          txnId:
            input.paymentTxnId,
        },
        select: {
          collectionLedgerTxnId:
            true,
        },
      });

    if (
      payment.collectionLedgerTxnId
    ) {
      return tx.ledgerTransaction.findUniqueOrThrow({
        where: {
          ledgerTxnId:
            payment.collectionLedgerTxnId,
        },
        include: {
          entries: true,
        },
      });
    }

    const clearing =
      await this.requireAccount(
        tx,
        this.collectionClearingCode(
          input.gateway,
        ),
      );

    const destination =
      await this.requireAccount(
        tx,
        input.disposition ===
          'REVENUE'
          ? SYSTEM_LEDGER_ACCOUNT_CODES
              .TICKET_SALES_REVENUE
          : SYSTEM_LEDGER_ACCOUNT_CODES
              .SUSPENSE,
      );

    const journal =
      await this.ledger.postInTransaction(
        tx,
        {
          idempotencyKey:
            `ledger:provider-collection:${input.paymentTxnId}`,

          kind:
            LedgerTransactionKind.PROVIDER_COLLECTION,

          referenceType:
            'PaymentTransaction',

          referenceId:
            input.paymentTxnId,

          description:
            input.disposition ===
            'REVENUE'
              ? 'Verified provider ticket collection'
              : 'Verified provider collection pending finance review',

          occurredAt:
            input.occurredAt,

          metadata: {
            gateway:
              input.gateway,

            providerReference:
              input.providerReference,

            providerTransactionId:
              input.providerTransactionId ??
              null,

            disposition:
              input.disposition,
          },

          lines: [
            {
              accountId:
                clearing.accountId,

              side:
                LedgerEntrySide.DEBIT,

              amountNgn:
                input.amountNgn,

              memo:
                'Provider funds received',
            },
            {
              accountId:
                destination.accountId,

              side:
                LedgerEntrySide.CREDIT,

              amountNgn:
                input.amountNgn,

              memo:
                input.disposition ===
                'REVENUE'
                  ? 'Ticket sales revenue'
                  : 'Unallocated successful collection',
            },
          ],
        },
      );

    await tx.paymentTransaction.update({
      where: {
        txnId:
          input.paymentTxnId,
      },
      data: {
        collectionLedgerTxnId:
          journal.ledgerTxnId,
      },
    });

    return journal;
  }

  async recordRefundAccrualInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      paymentTxnId: string;
      amountNgn: number;
      source:
        | 'REVENUE'
        | 'SUSPENSE';
      reason: string;
    },
  ) {
    const payment =
      await tx.paymentTransaction.findUniqueOrThrow({
        where: {
          txnId:
            input.paymentTxnId,
        },
        select: {
          refundAccrualLedgerTxnId:
            true,
        },
      });

    if (
      payment.refundAccrualLedgerTxnId
    ) {
      return tx.ledgerTransaction.findUniqueOrThrow({
        where: {
          ledgerTxnId:
            payment.refundAccrualLedgerTxnId,
        },
        include: {
          entries: true,
        },
      });
    }

    const source =
      await this.requireAccount(
        tx,
        input.source ===
          'REVENUE'
          ? SYSTEM_LEDGER_ACCOUNT_CODES
              .TICKET_SALES_REVENUE
          : SYSTEM_LEDGER_ACCOUNT_CODES
              .SUSPENSE,
      );

    const payable =
      await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES
          .REFUND_PAYABLE,
      );

    const journal =
      await this.ledger.postInTransaction(
        tx,
        {
          idempotencyKey:
            `ledger:refund-accrual:${input.paymentTxnId}`,

          kind:
            LedgerTransactionKind.REFUND_ACCRUAL,

          referenceType:
            'PaymentTransaction',

          referenceId:
            input.paymentTxnId,

          description:
            'Customer refund obligation',

          metadata: {
            reason:
              input.reason,

            source:
              input.source,
          },

          lines: [
            {
              accountId:
                source.accountId,

              side:
                LedgerEntrySide.DEBIT,

              amountNgn:
                input.amountNgn,

              memo:
                'Reverse original collection disposition',
            },
            {
              accountId:
                payable.accountId,

              side:
                LedgerEntrySide.CREDIT,

              amountNgn:
                input.amountNgn,

              memo:
                'Customer refund payable',
            },
          ],
        },
      );

    await tx.paymentTransaction.update({
      where: {
        txnId:
          input.paymentTxnId,
      },
      data: {
        refundAccrualLedgerTxnId:
          journal.ledgerTxnId,
      },
    });

    return journal;
  }

  async recordRefundSettlementInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      paymentTxnId: string;
      gateway: PaymentGateway;
      amountNgn: number;
      providerReference?: string | null;
    },
  ) {
    const payment =
      await tx.paymentTransaction.findUniqueOrThrow({
        where: {
          txnId:
            input.paymentTxnId,
        },
        select: {
          refundAccrualLedgerTxnId:
            true,

          refundSettlementLedgerTxnId:
            true,
        },
      });

    if (
      !payment.refundAccrualLedgerTxnId
    ) {
      throw new ConflictException(
        'Refund settlement cannot be posted before refund accrual',
      );
    }

    if (
      payment.refundSettlementLedgerTxnId
    ) {
      return tx.ledgerTransaction.findUniqueOrThrow({
        where: {
          ledgerTxnId:
            payment.refundSettlementLedgerTxnId,
        },
        include: {
          entries: true,
        },
      });
    }

    const payable =
      await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES
          .REFUND_PAYABLE,
      );

    const clearing =
      await this.requireAccount(
        tx,
        this.collectionClearingCode(
          input.gateway,
        ),
      );

    const journal =
      await this.ledger.postInTransaction(
        tx,
        {
          idempotencyKey:
            `ledger:refund-settlement:${input.paymentTxnId}`,

          kind:
            LedgerTransactionKind.REFUND_SETTLEMENT,

          referenceType:
            'PaymentTransaction',

          referenceId:
            input.paymentTxnId,

          description:
            'Provider refund settlement',

          metadata: {
            gateway:
              input.gateway,

            providerReference:
              input.providerReference ??
              null,
          },

          lines: [
            {
              accountId:
                payable.accountId,

              side:
                LedgerEntrySide.DEBIT,

              amountNgn:
                input.amountNgn,

              memo:
                'Settle customer refund payable',
            },
            {
              accountId:
                clearing.accountId,

              side:
                LedgerEntrySide.CREDIT,

              amountNgn:
                input.amountNgn,

              memo:
                'Provider funds returned to customer',
            },
          ],
        },
      );

    await tx.paymentTransaction.update({
      where: {
        txnId:
          input.paymentTxnId,
      },
      data: {
        refundSettlementLedgerTxnId:
          journal.ledgerTxnId,
      },
    });

    return journal;
  }

  private collectionClearingCode(
    gateway: PaymentGateway,
  ) {
    switch (gateway) {
      case PaymentGateway.MONNIFY:
        return SYSTEM_LEDGER_ACCOUNT_CODES
          .MONNIFY_COLLECTION_CLEARING;

      case PaymentGateway.FLUTTERWAVE:
        return SYSTEM_LEDGER_ACCOUNT_CODES
          .FLUTTERWAVE_CLEARING;

      default:
        throw new ConflictException(
          `Gateway ${gateway} is not an active online collection provider`,
        );
    }
  }

  private async requireAccount(
    tx: Prisma.TransactionClient,
    code: string,
  ) {
    const account =
      await tx.ledgerAccount.findUnique({
        where: {
          code,
        },
      });

    if (!account) {
      throw new ConflictException(
        `Required ledger account ${code} does not exist`,
      );
    }

    return account;
  }
}
