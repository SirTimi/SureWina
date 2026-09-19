import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';

import {
  LedgerEntrySide,
  LedgerTransactionKind,
  Prisma,
  TreasuryProvider,
  TreasurySettlementStatus,
} from '@prisma/client';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { SYSTEM_LEDGER_ACCOUNT_CODES } from '../ledger/ledger.constants';

import {
  ExternalSettlement,
  ExternalSettlementTransaction,
  TreasuryProviderService,
} from './treasury-provider.service';

type MonnifySettlementEvent = {
  amount?: string | number;
  settlementTime?: string;
  settlementReference?: string;
  destinationAccountNumber?: string;
  destinationBankName?: string;
  destinationAccountName?: string;
  transactionsCount?: number;
};

@Injectable()
export class TreasurySettlementService {
  private readonly logger =
    new Logger(TreasurySettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly providers: TreasuryProviderService,
    private readonly config: ConfigService,
  ) {}

  async syncFlutterwave(
    from: Date,
    to: Date,
  ) {
    const external =
      await this.providers.flutterwaveSettlements(
        from,
        to,
      );

    const settlementIds: string[] = [];

    for (const settlement of external) {
      const stored =
        await this.storeFlutterwaveSettlement(
          settlement,
        );

      settlementIds.push(
        stored.settlementId,
      );
    }

    return {
      provider:
        TreasuryProvider.FLUTTERWAVE,
      settlements:
        settlementIds.length,
      settlementIds,
    };
  }

  async ingestMonnifySettlement(
    eventData: MonnifySettlementEvent,
  ) {
    const reference =
      eventData.settlementReference
        ?.trim();

    if (!reference) {
      throw new ConflictException(
        'Monnify settlement webhook has no settlementReference',
      );
    }

    /*
     * The signed webhook only tells us which settlement changed.
     * Pull the constituent transactions through Monnify's authenticated API
     * before creating financial settlement state.
     */
    const lines =
      await this.providers.monnifySettlementTransactions(
        reference,
      );

    if (
      lines.length ===
      0
    ) {
      throw new ConflictException(
        'Monnify returned no transactions for settlement reference',
      );
    }

    const grossMinor =
      lines.reduce(
        (
          sum,
          line,
        ) =>
          sum +
          line.grossAmountMinor,
        0n,
      );

    const netMinor =
      lines.reduce(
        (
          sum,
          line,
        ) =>
          sum +
          line.netAmountMinor,
        0n,
      );

    const feeMinor =
      grossMinor >=
      netMinor
        ? grossMinor -
          netMinor
        : 0n;

    const eventAmountMinor =
      eventData.amount ===
        undefined
        ? null
        : this.toMinor(
            eventData.amount,
          );

    const collection =
      await this.treasuryAccount(
        'TRSY:MONNIFY:COLLECTION',
      );

    const status =
      eventAmountMinor !==
        null &&
      eventAmountMinor !==
        netMinor
        ? TreasurySettlementStatus.FLAGGED
        : TreasurySettlementStatus.COMPLETED;

    const stored =
      await this.prisma.$transaction(
        async (tx) => {
          const settlement =
            await tx.treasurySettlement.upsert({
              where: {
                provider_providerSettlementId: {
                  provider:
                    TreasuryProvider.MONNIFY,
                  providerSettlementId:
                    reference,
                },
              },
              create: {
                treasuryAccountId:
                  collection.treasuryAccountId,
                provider:
                  TreasuryProvider.MONNIFY,
                providerSettlementId:
                  reference,
                currency:
                  'NGN',
                grossAmountMinor:
                  grossMinor,
                feeAmountMinor:
                  feeMinor,
                refundAmountMinor:
                  0n,
                chargebackAmountMinor:
                  0n,
                netAmountMinor:
                  netMinor,
                status,
                destination:
                  eventData.destinationBankName ??
                  null,
                destinationReference:
                  eventData.destinationAccountNumber ??
                  null,
                settlementDate:
                  this.parseDate(
                    eventData.settlementTime,
                  ),
                processedAt:
                  new Date(),
                rawPayload:
                  this.json(
                    eventData,
                  ),
              },
              update: {
                grossAmountMinor:
                  grossMinor,
                feeAmountMinor:
                  feeMinor,
                netAmountMinor:
                  netMinor,
                status,
                destination:
                  eventData.destinationBankName ??
                  null,
                destinationReference:
                  eventData.destinationAccountNumber ??
                  null,
                settlementDate:
                  this.parseDate(
                    eventData.settlementTime,
                  ),
                processedAt:
                  new Date(),
                rawPayload:
                  this.json(
                    eventData,
                  ),
              },
            });

          await this.ensureLines(
            tx,
            settlement.settlementId,
            lines,
          );

          if (
            status ===
            TreasurySettlementStatus.COMPLETED
          ) {
            return this.postSettlementInTransaction(
              tx,
              settlement.settlementId,
            );
          }

          return settlement;
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );

    if (
      status ===
      TreasurySettlementStatus.FLAGGED
    ) {
      this.logger.warn(
        `Monnify settlement ${reference} amount differs from authenticated constituent total`,
      );
    }

    return stored;
  }

  async list(
    provider?: TreasuryProvider,
  ) {
    const rows =
      await this.prisma.treasurySettlement.findMany({
        where:
          provider
            ? {
                provider,
              }
            : undefined,
        orderBy: [
          {
            settlementDate:
              'desc',
          },
          {
            createdAt:
              'desc',
          },
        ],
        take:
          200,
        include: {
          treasuryAccount:
            true,
          _count: {
            select: {
              lines:
                true,
            },
          },
        },
      });

    return {
      settlements:
        rows.map(
          (row) => ({
            settlementId:
              row.settlementId,
            provider:
              row.provider,
            providerSettlementId:
              row.providerSettlementId,
            accountCode:
              row.treasuryAccount.code,
            currency:
              row.currency,
            grossAmountMinor:
              row.grossAmountMinor.toString(),
            feeAmountMinor:
              row.feeAmountMinor.toString(),
            refundAmountMinor:
              row.refundAmountMinor.toString(),
            chargebackAmountMinor:
              row.chargebackAmountMinor.toString(),
            netAmountMinor:
              row.netAmountMinor.toString(),
            status:
              row.status,
            destination:
              row.destination,
            destinationReference:
              row.destinationReference,
            settlementDate:
              row.settlementDate?.toISOString() ??
              null,
            processedAt:
              row.processedAt?.toISOString() ??
              null,
            ledgerTxnId:
              row.ledgerTxnId,
            lines:
              row._count.lines,
          }),
        ),
    };
  }

  private async storeFlutterwaveSettlement(
    external: ExternalSettlement,
  ) {
    const collection =
      await this.treasuryAccount(
        'TRSY:FLUTTERWAVE:COLLECTION',
      );

    const status =
      this.mapSettlementStatus(
        external.status,
      );

    return this.prisma.$transaction(
      async (tx) => {
        const settlement =
          await tx.treasurySettlement.upsert({
            where: {
              provider_providerSettlementId: {
                provider:
                  TreasuryProvider.FLUTTERWAVE,
                providerSettlementId:
                  external.providerSettlementId,
              },
            },
            create: {
              treasuryAccountId:
                collection.treasuryAccountId,
              provider:
                TreasuryProvider.FLUTTERWAVE,
              providerSettlementId:
                external.providerSettlementId,
              currency:
                external.currency,
              grossAmountMinor:
                external.grossAmountMinor,
              feeAmountMinor:
                external.feeAmountMinor,
              refundAmountMinor:
                external.refundAmountMinor,
              chargebackAmountMinor:
                external.chargebackAmountMinor,
              netAmountMinor:
                external.netAmountMinor,
              status,
              destination:
                external.destination,
              destinationReference:
                external.destinationReference,
              settlementDate:
                external.settlementDate,
              processedAt:
                external.processedAt,
              rawPayload:
                this.json(
                  external.raw,
                ),
            },
            update: {
              currency:
                external.currency,
              grossAmountMinor:
                external.grossAmountMinor,
              feeAmountMinor:
                external.feeAmountMinor,
              refundAmountMinor:
                external.refundAmountMinor,
              chargebackAmountMinor:
                external.chargebackAmountMinor,
              netAmountMinor:
                external.netAmountMinor,
              status,
              destination:
                external.destination,
              destinationReference:
                external.destinationReference,
              settlementDate:
                external.settlementDate,
              processedAt:
                external.processedAt,
              rawPayload:
                this.json(
                  external.raw,
                ),
            },
          });

        await this.ensureLines(
          tx,
          settlement.settlementId,
          external.transactions,
        );

        if (
          status ===
          TreasurySettlementStatus.COMPLETED
        ) {
          return this.postSettlementInTransaction(
            tx,
            settlement.settlementId,
          );
        }

        return settlement;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async ensureLines(
    tx: Prisma.TransactionClient,
    settlementId: string,
    lines: ExternalSettlementTransaction[],
  ) {
    const existing =
      await tx.treasurySettlementLine.count({
        where: {
          settlementId,
        },
      });

    if (
      existing >
      0
    ) {
      return;
    }

    for (const line of lines) {
      const [
        payment,
        funding,
      ] =
        await Promise.all([
          line.providerReference
            ? tx.paymentTransaction.findUnique({
                where: {
                  gatewayReference:
                    line.providerReference,
                },
                select: {
                  txnId:
                    true,
                },
              })
            : null,
          line.providerReference
            ? tx.walletFunding.findUnique({
                where: {
                  gatewayReference:
                    line.providerReference,
                },
                select: {
                  fundingId:
                    true,
                },
              })
            : null,
        ]);

      await tx.treasurySettlementLine.create({
        data: {
          settlementId,
          providerTransactionId:
            line.providerTransactionId,
          providerReference:
            line.providerReference,
          grossAmountMinor:
            line.grossAmountMinor,
          feeAmountMinor:
            line.feeAmountMinor,
          netAmountMinor:
            line.netAmountMinor,
          currency:
            line.currency,
          paymentTxnId:
            payment?.txnId ??
            null,
          walletFundingId:
            funding?.fundingId ??
            null,
          rawPayload:
            this.json(
              line.raw,
            ),
        },
      });
    }
  }

  private async postSettlementInTransaction(
    tx: Prisma.TransactionClient,
    settlementId: string,
  ) {
    const settlement =
      await tx.treasurySettlement.findUniqueOrThrow({
        where: {
          settlementId,
        },
        include: {
          treasuryAccount:
            true,
        },
      });

    if (
      settlement.ledgerTxnId
    ) {
      return settlement;
    }

    if (
      settlement.status !==
      TreasurySettlementStatus.COMPLETED
    ) {
      return settlement;
    }

    if (
      settlement.currency !==
      'NGN'
    ) {
      throw new ConflictException(
        'Only NGN settlements are supported',
      );
    }

    const destinationCode =
      this.destinationLedgerCode(
        settlement.provider,
        settlement.destination,
        settlement.destinationReference,
      );

    const destination =
      await this.requireAccount(
        tx,
        destinationCode,
      );

    const feeExpense =
      await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES
          .PAYMENT_PROCESSING_FEES,
      );

    const providerAdjustment =
      await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES
          .PROVIDER_ADJUSTMENT_EXPENSE,
      );

    const payoutWallet =
      settlement.provider ===
        TreasuryProvider.MONNIFY
        ? await this.requireAccount(
            tx,
            SYSTEM_LEDGER_ACCOUNT_CODES
              .MONNIFY_PAYOUT_CLEARING,
          )
        : await this.requireAccount(
            tx,
            SYSTEM_LEDGER_ACCOUNT_CODES
              .FLUTTERWAVE_PAYOUT_CLEARING,
          );

    const grossNgn =
      this.minorToNgn(
        settlement.grossAmountMinor,
      );

    const netNgn =
      this.minorToNgn(
        settlement.netAmountMinor,
      );

    const feeNgn =
      this.minorToNgn(
        settlement.feeAmountMinor,
      );

    const refundNgn =
      this.minorToNgn(
        settlement.refundAmountMinor,
      );

    const adjustmentNgn =
      grossNgn -
      netNgn -
      feeNgn -
      refundNgn;

    if (
      grossNgn <=
      0
    ) {
      throw new ConflictException(
        'Settlement gross amount must be positive',
      );
    }

    const lines: Array<{
      accountId: string;
      side: LedgerEntrySide;
      amountNgn: number;
      memo: string;
    }> = [];

    if (
      netNgn >
      0
    ) {
      lines.push({
        accountId:
          destination.accountId,
        side:
          LedgerEntrySide.DEBIT,
        amountNgn:
          netNgn,
        memo:
          'Provider settlement destination',
      });
    }

    if (
      feeNgn >
      0
    ) {
      lines.push({
        accountId:
          feeExpense.accountId,
        side:
          LedgerEntrySide.DEBIT,
        amountNgn:
          feeNgn,
        memo:
          'Provider processing fees',
      });
    }

    /*
     * Refunds are paid from the provider payout wallet. If the provider
     * withholds the refund from this collection settlement, this line
     * replenishes the payout-wallet position that funded the customer.
     */
    if (
      refundNgn >
      0
    ) {
      lines.push({
        accountId:
          payoutWallet.accountId,
        side:
          LedgerEntrySide.DEBIT,
        amountNgn:
          refundNgn,
        memo:
          'Refund funding replenishment',
      });
    }

    if (
      adjustmentNgn >
      0
    ) {
      lines.push({
        accountId:
          providerAdjustment.accountId,
        side:
          LedgerEntrySide.DEBIT,
        amountNgn:
          adjustmentNgn,
        memo:
          'Provider chargeback or settlement adjustment',
      });
    } else if (
      adjustmentNgn <
      0
    ) {
      lines.push({
        accountId:
          providerAdjustment.accountId,
        side:
          LedgerEntrySide.CREDIT,
        amountNgn:
          -adjustmentNgn,
        memo:
          'Provider settlement rounding adjustment',
      });
    }

    lines.push({
      accountId:
        settlement.treasuryAccount.ledgerAccountId,
      side:
        LedgerEntrySide.CREDIT,
      amountNgn:
        grossNgn,
      memo:
        'Clear settled provider collections',
    });

    const journal =
      await this.ledger.postInTransaction(
        tx,
        {
          idempotencyKey:
            `ledger:provider-settlement:${settlement.provider}:${settlement.providerSettlementId}`,
          kind:
            LedgerTransactionKind.PROVIDER_SETTLEMENT,
          referenceType:
            'TreasurySettlement',
          referenceId:
            settlement.settlementId,
          description:
            `${settlement.provider} collection settlement`,
          occurredAt:
            settlement.processedAt ??
            settlement.settlementDate ??
            new Date(),
          metadata: {
            provider:
              settlement.provider,
            providerSettlementId:
              settlement.providerSettlementId,
            externalGrossMinor:
              settlement.grossAmountMinor.toString(),
            externalNetMinor:
              settlement.netAmountMinor.toString(),
            externalFeeMinor:
              settlement.feeAmountMinor.toString(),
            externalRefundMinor:
              settlement.refundAmountMinor.toString(),
            externalChargebackMinor:
              settlement.chargebackAmountMinor.toString(),
            roundedGrossNgn:
              grossNgn,
            roundedNetNgn:
              netNgn,
            roundedFeeNgn:
              feeNgn,
            roundedRefundNgn:
              refundNgn,
            roundedAdjustmentNgn:
              adjustmentNgn,
          },
          lines:
            this.combineLines(
              lines,
            ),
        },
      );

    return tx.treasurySettlement.update({
      where: {
        settlementId:
          settlement.settlementId,
      },
      data: {
        ledgerTxnId:
          journal.ledgerTxnId,
      },
    });
  }

  private combineLines(
    lines: Array<{
      accountId: string;
      side: LedgerEntrySide;
      amountNgn: number;
      memo: string;
    }>,
  ) {
    const totals =
      new Map<
        string,
        {
          debit: number;
          credit: number;
          memos: string[];
        }
      >();

    for (const line of lines) {
      const current =
        totals.get(
          line.accountId,
        ) ?? {
          debit: 0,
          credit: 0,
          memos: [],
        };

      if (
        line.side ===
        LedgerEntrySide.DEBIT
      ) {
        current.debit +=
          line.amountNgn;
      } else {
        current.credit +=
          line.amountNgn;
      }

      current.memos.push(
        line.memo,
      );

      totals.set(
        line.accountId,
        current,
      );
    }

    return [
      ...totals.entries(),
    ]
      .map(
        (
          [
            accountId,
            total,
          ],
        ) => {
          const net =
            total.debit -
            total.credit;

          if (net === 0) {
            return null;
          }

          return {
            accountId,
            side:
              net >
              0
                ? LedgerEntrySide.DEBIT
                : LedgerEntrySide.CREDIT,
            amountNgn:
              Math.abs(
                net,
              ),
            memo:
              [
                ...new Set(
                  total.memos,
                ),
              ].join(
                '; ',
              ),
          };
        },
      )
      .filter(
        (
          line,
        ): line is {
          accountId: string;
          side: LedgerEntrySide;
          amountNgn: number;
          memo: string;
        } =>
          line !==
          null,
      );
  }

  private destinationLedgerCode(
    provider: TreasuryProvider,
    destination: string | null,
    destinationReference: string | null,
  ) {
    const text =
      `${destination ?? ''} ${destinationReference ?? ''}`
        .trim()
        .toLowerCase();

    const monnifyWallet =
      this.config.get<string>(
        'MONNIFY_SOURCE_ACCOUNT_NUMBER',
      );

    if (
      provider ===
        TreasuryProvider.MONNIFY &&
      (
        text.includes(
          'wallet',
        ) ||
        (
          monnifyWallet &&
          destinationReference ===
            monnifyWallet
        )
      )
    ) {
      return SYSTEM_LEDGER_ACCOUNT_CODES
        .MONNIFY_PAYOUT_CLEARING;
    }

    if (
      provider ===
        TreasuryProvider.FLUTTERWAVE &&
      text.includes(
        'wallet',
      )
    ) {
      return SYSTEM_LEDGER_ACCOUNT_CODES
        .FLUTTERWAVE_PAYOUT_CLEARING;
    }

    return SYSTEM_LEDGER_ACCOUNT_CODES
      .BANK_CASH;
  }

  private mapSettlementStatus(
    status: string,
  ) {
    switch (
      status
        .trim()
        .toUpperCase()
    ) {
      case 'COMPLETED':
      case 'SUCCESS':
      case 'SUCCESSFUL':
        return TreasurySettlementStatus.COMPLETED;

      case 'PENDING':
      case 'PROCESSING':
        return TreasurySettlementStatus.PROCESSING;

      case 'FLAGGED':
        return TreasurySettlementStatus.FLAGGED;

      case 'FAILED':
        return TreasurySettlementStatus.FAILED;

      default:
        return TreasurySettlementStatus.UNKNOWN;
    }
  }

  private treasuryAccount(
    code: string,
  ) {
    return this.prisma.treasuryAccount.findUniqueOrThrow({
      where: {
        code,
      },
    });
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

  private minorToNgn(
    value: bigint,
  ) {
    return Number(
      (
        value +
        50n
      ) /
      100n,
    );
  }

  private toMinor(
    value:
      | string
      | number,
  ) {
    const number =
      typeof value ===
        'number'
        ? value
        : Number(
            value,
          );

    if (
      !Number.isFinite(
        number,
      )
    ) {
      return 0n;
    }

    return BigInt(
      Math.round(
        number *
        100,
      ),
    );
  }

  private parseDate(
    value:
      | string
      | null
      | undefined,
  ) {
    if (!value) {
      return null;
    }

    const parsed =
      new Date(
        value,
      );

    return Number.isNaN(
      parsed.getTime(),
    )
      ? null
      : parsed;
  }

  private json(
    value: unknown,
  ): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify(
        value ??
        null,
      ),
    ) as Prisma.InputJsonValue;
  }
}
