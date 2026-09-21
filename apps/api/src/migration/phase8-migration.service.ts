import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  FinancialMigrationItemStatus,
  FinancialMigrationKind,
  FinancialMigrationRunStatus,
  LedgerAccountPurpose,
  LedgerAccountType,
  LedgerEntrySide,
  LedgerOwnerType,
  LedgerTransactionKind,
  PaymentGateway,
  PaymentRefundStatus,
  PaymentStatus,
  Prisma,
  PrizeClaimStatus,
  PrizePayoutStatus,
  RemittanceStatus,
  WalletFundingStatus,
} from '@prisma/client';

import {
  createHash,
} from 'crypto';

import { PrismaService } from '../database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { PaymentAccountingService } from '../ledger/payment-accounting.service';
import { SYSTEM_LEDGER_ACCOUNT_CODES } from '../ledger/ledger.constants';
import { WalletService } from '../wallet/wallet.service';

const APPLY_ORDER: FinancialMigrationKind[] = [
  FinancialMigrationKind.PAYMENT_COLLECTION,
  FinancialMigrationKind.WALLET_FUNDING,
  FinancialMigrationKind.PAYMENT_REFUND,
  FinancialMigrationKind.PRIZE_ACCRUAL,
  FinancialMigrationKind.AGENT_PRIZE_PAYOUT,
  FinancialMigrationKind.REMITTANCE_ACCOUNTING,
  FinancialMigrationKind.AGENT_WALLET_BALANCE,
  FinancialMigrationKind.PRIZE_PAYOUT_HISTORY,
];

const MIGRATABLE_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.CONFIRMED,
  PaymentStatus.REVIEW_REQUIRED,
  PaymentStatus.REFUND_PENDING,
  PaymentStatus.REFUNDED,
];

class ReviewRequiredError extends Error {}

type MigrationResult = {
  skipped: boolean;
  ledgerTxnId: string | null;
  result: unknown;
};

@Injectable()
export class Phase8MigrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly paymentAccounting: PaymentAccountingService,
    private readonly wallets: WalletService,
  ) {}

  async plan(input: {
    label: string;
    cutoverAt: Date;
    createdBy?: string;
  }) {
    if (
      Number.isNaN(
        input.cutoverAt.getTime(),
      )
    ) {
      throw new BadRequestException(
        'A valid financial cutover timestamp is required',
      );
    }

    if (
      input.cutoverAt.getTime() >
      Date.now()
    ) {
      throw new BadRequestException(
        'Financial cutover cannot be in the future',
      );
    }

    const active =
      await this.prisma.financialMigrationRun.findFirst({
        where: {
          status: {
            in: [
              FinancialMigrationRunStatus.PLANNED,
              FinancialMigrationRunStatus.RUNNING,
            ],
          },
        },
        orderBy: {
          createdAt:
            'desc',
        },
      });

    if (active) {
      throw new ConflictException(
        `Migration run ${active.runId} is already ${active.status}`,
      );
    }

    const run =
      await this.prisma.financialMigrationRun.create({
        data: {
          label:
            input.label.trim() ||
            'Phase 8 financial migration',
          cutoverAt:
            input.cutoverAt,
          createdBy:
            input.createdBy?.trim() ||
            'phase8-cli',
        },
      });

    const items: Prisma.FinancialMigrationItemCreateManyInput[] =
      [];

    await this.planAgentWallets(
      run.runId,
      input.cutoverAt,
      items,
    );

    await this.planPayments(
      run.runId,
      input.cutoverAt,
      items,
    );

    await this.planWalletFundings(
      run.runId,
      input.cutoverAt,
      items,
    );

    await this.planRefunds(
      run.runId,
      input.cutoverAt,
      items,
    );

    await this.planPrizeAccruals(
      run.runId,
      input.cutoverAt,
      items,
    );

    await this.planAgentPrizes(
      run.runId,
      input.cutoverAt,
      items,
    );

    await this.planRemittances(
      run.runId,
      input.cutoverAt,
      items,
    );

    await this.planPrizePayoutHistory(
      run.runId,
      input.cutoverAt,
      items,
    );

    for (
      let index = 0;
      index < items.length;
      index += 500
    ) {
      await this.prisma.financialMigrationItem.createMany({
        data:
          items.slice(
            index,
            index + 500,
          ),
        skipDuplicates:
          true,
      });
    }

    const plannedCount =
      await this.prisma.financialMigrationItem.count({
        where: {
          runId:
            run.runId,
        },
      });

    await this.prisma.financialMigrationRun.update({
      where: {
        runId:
          run.runId,
      },
      data: {
        plannedCount,
      },
    });

    return this.status(
      run.runId,
    );
  }

  async apply(
    runId: string,
    batchSize = 100,
  ) {
    const safeBatch =
      Math.min(
        500,
        Math.max(
          1,
          batchSize,
        ),
      );

    const run =
      await this.requireRun(
        runId,
      );

    if (
      run.status ===
      FinancialMigrationRunStatus.FINALIZED
    ) {
      throw new ConflictException(
        'Finalized migration runs cannot be changed',
      );
    }

    if (
      run.status !==
        FinancialMigrationRunStatus.PLANNED &&
      run.status !==
        FinancialMigrationRunStatus.RUNNING &&
      run.status !==
        FinancialMigrationRunStatus.COMPLETED_WITH_EXCEPTIONS
    ) {
      throw new ConflictException(
        `Migration run is ${run.status}`,
      );
    }

    await this.prisma.financialMigrationRun.update({
      where: {
        runId,
      },
      data: {
        status:
          FinancialMigrationRunStatus.RUNNING,
        startedAt:
          run.startedAt ??
          new Date(),
        completedAt:
          null,
      },
    });

    try {
      for (
        const kind
        of APPLY_ORDER
      ) {
        while (true) {
          const items =
            await this.prisma.financialMigrationItem.findMany({
              where: {
                runId,
                kind,
                status:
                  FinancialMigrationItemStatus.PENDING,
              },
              orderBy: {
                createdAt:
                  'asc',
              },
              take:
                safeBatch,
            });

          if (
            items.length ===
            0
          ) {
            break;
          }

          for (
            const item
            of items
          ) {
            await this.processItem(
              item,
              run.cutoverAt,
            );
          }
        }
      }

      await this.refreshRunCounts(
        runId,
        true,
      );

      return this.status(
        runId,
      );
    } catch (error) {
      await this.prisma.financialMigrationRun.update({
        where: {
          runId,
        },
        data: {
          status:
            FinancialMigrationRunStatus.FAILED,
          completedAt:
            new Date(),
          notes:
            error instanceof Error
              ? error.message
              : 'Phase 8 migration failed',
        },
      });

      throw error;
    }
  }

  async retry(
    runId: string,
    includeReview = false,
  ) {
    const run =
      await this.requireRun(
        runId,
      );

    if (
      run.status ===
      FinancialMigrationRunStatus.FINALIZED
    ) {
      throw new ConflictException(
        'Finalized migration runs cannot be retried',
      );
    }

    await this.prisma.financialMigrationItem.updateMany({
      where: {
        runId,
        status: {
          in:
            includeReview
              ? [
                  FinancialMigrationItemStatus.FAILED,
                  FinancialMigrationItemStatus.REVIEW_REQUIRED,
                ]
              : [
                  FinancialMigrationItemStatus.FAILED,
                ],
        },
      },
      data: {
        status:
          FinancialMigrationItemStatus.PENDING,
        errorMessage:
          null,
      },
    });

    await this.prisma.financialMigrationRun.update({
      where: {
        runId,
      },
      data: {
        status:
          FinancialMigrationRunStatus.RUNNING,
        completedAt:
          null,
      },
    });

    return this.apply(
      runId,
    );
  }

  async finalize(
    runId: string,
  ) {
    const run =
      await this.requireRun(
        runId,
      );

    const counts =
      await this.itemCounts(
        runId,
      );

    if (
      counts.pending >
        0 ||
      counts.failed >
        0 ||
      counts.review >
        0
    ) {
      throw new ConflictException(
        `Migration still has pending=${counts.pending}, failed=${counts.failed}, review=${counts.review}`,
      );
    }

    const audit =
      await this.auditOutstanding(
        run.cutoverAt,
      );

    const blocking =
      Object.entries(
        audit,
      ).filter(
        (
          [
            key,
            value,
          ],
        ) =>
          key !==
            'openCriticalReconciliationIssues' &&
          value >
            0,
      );

    if (
      blocking.length >
      0
    ) {
      throw new ConflictException(
        `Phase 8 cannot finalize: ${blocking
          .map(
            (
              [
                key,
                value,
              ],
            ) =>
              `${key}=${value}`,
          )
          .join(
            ', ',
          )}`,
      );
    }

    const finalized =
      await this.prisma.financialMigrationRun.update({
        where: {
          runId,
        },
        data: {
          status:
            FinancialMigrationRunStatus.FINALIZED,
          finalizedAt:
            new Date(),
          completedAt:
            run.completedAt ??
            new Date(),
          notes:
            audit.openCriticalReconciliationIssues >
            0
              ? `Finalized with ${audit.openCriticalReconciliationIssues} external reconciliation issue(s) still requiring Finance review`
              : 'Phase 8 migration finalized cleanly',
        },
      });

    return {
      run:
        this.runView(
          finalized,
        ),
      audit,
    };
  }

  async status(
    runId: string,
  ) {
    const run =
      await this.requireRun(
        runId,
      );

    const counts =
      await this.itemCounts(
        runId,
      );

    const exceptions =
      await this.prisma.financialMigrationItem.findMany({
        where: {
          runId,
          status: {
            in: [
              FinancialMigrationItemStatus.REVIEW_REQUIRED,
              FinancialMigrationItemStatus.FAILED,
            ],
          },
        },
        orderBy: [
          {
            kind:
              'asc',
          },
          {
            createdAt:
              'asc',
          },
        ],
        take:
          200,
      });

    return {
      run:
        this.runView(
          run,
        ),
      counts,
      exceptions:
        exceptions.map(
          (
            item,
          ) => ({
            itemId:
              item.itemId,
            kind:
              item.kind,
            sourceType:
              item.sourceType,
            sourceId:
              item.sourceId,
            status:
              item.status,
            errorMessage:
              item.errorMessage,
            snapshot:
              item.snapshot,
            result:
              item.result,
          }),
        ),
    };
  }

  async audit(
    runId: string,
  ) {
    const run =
      await this.requireRun(
        runId,
      );

    return this.auditOutstanding(
      run.cutoverAt,
    );
  }

  private async processItem(
    item: {
      itemId: string;
      kind: FinancialMigrationKind;
      sourceType: string;
      sourceId: string;
    },
    cutoverAt: Date,
  ) {
    try {
      const result =
        await this.dispatch(
          item.kind,
          item.sourceId,
          cutoverAt,
        );

      await this.prisma.financialMigrationItem.update({
        where: {
          itemId:
            item.itemId,
        },
        data: {
          status:
            result.skipped
              ? FinancialMigrationItemStatus.SKIPPED
              : FinancialMigrationItemStatus.APPLIED,
          result:
            this.json(
              result.result,
            ),
          ledgerTxnId:
            result.ledgerTxnId ??
            null,
          errorMessage:
            null,
        },
      });
    } catch (error) {
      const review =
        error instanceof
        ReviewRequiredError;

      await this.prisma.financialMigrationItem.update({
        where: {
          itemId:
            item.itemId,
        },
        data: {
          status:
            review
              ? FinancialMigrationItemStatus.REVIEW_REQUIRED
              : FinancialMigrationItemStatus.FAILED,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Unknown migration error',
        },
      });
    }
  }

  private dispatch(
    kind: FinancialMigrationKind,
    sourceId: string,
    cutoverAt: Date,
  ): Promise<MigrationResult> {
    switch (
      kind
    ) {
      case FinancialMigrationKind.PAYMENT_COLLECTION:
        return this.migratePaymentCollection(
          sourceId,
        );

      case FinancialMigrationKind.WALLET_FUNDING:
        return this.migrateWalletFunding(
          sourceId,
        );

      case FinancialMigrationKind.PAYMENT_REFUND:
        return this.migratePaymentRefund(
          sourceId,
        );

      case FinancialMigrationKind.PRIZE_ACCRUAL:
        return this.migratePrizeAccrual(
          sourceId,
        );

      case FinancialMigrationKind.AGENT_PRIZE_PAYOUT:
        return this.migrateAgentPrize(
          sourceId,
        );

      case FinancialMigrationKind.REMITTANCE_ACCOUNTING:
        return this.migrateRemittance(
          sourceId,
        );

      case FinancialMigrationKind.AGENT_WALLET_BALANCE:
        return this.migrateAgentWallet(
          sourceId,
          cutoverAt,
        );

      case FinancialMigrationKind.PRIZE_PAYOUT_HISTORY:
        return this.migratePrizePayoutHistory(
          sourceId,
        );

      default:
        throw new Error(
          `Unsupported financial migration kind: ${kind}`,
        );
    }
  }

  private async migratePaymentCollection(
    txnId: string,
  ) {
    const payment =
      await this.prisma.paymentTransaction.findUnique({
        where: {
          txnId,
        },
        include: {
          _count: {
            select: {
              tickets:
                true,
            },
          },
        },
      });

    if (!payment) {
      throw new ReviewRequiredError(
        'Payment transaction no longer exists',
      );
    }

    if (
      payment.collectionLedgerTxnId
    ) {
      return {
        skipped: true,
        ledgerTxnId:
          payment.collectionLedgerTxnId,
        result: {
          reason:
            'Collection already ledger-backed',
        },
      };
    }

    const disposition =
      payment.status ===
        PaymentStatus.REVIEW_REQUIRED ||
      payment._count.tickets ===
        0
        ? 'SUSPENSE' as const
        : 'REVENUE' as const;

    if (
      payment.gateway ===
      PaymentGateway.AGENT_CASH
    ) {
      if (!payment.agentId) {
        throw new ReviewRequiredError(
          'Legacy agent-cash payment has no agentId',
        );
      }

      const journal =
        await this.prisma.$transaction(
          async (
            tx,
          ) => {
            const receivable =
              await this.ensureAgentReceivable(
                tx,
                payment.agentId!,
              );

            const destination =
              await this.requireAccount(
                tx,
                disposition ===
                'REVENUE'
                  ? SYSTEM_LEDGER_ACCOUNT_CODES.TICKET_SALES_REVENUE
                  : SYSTEM_LEDGER_ACCOUNT_CODES.SUSPENSE,
              );

            const posted =
              await this.ledger.postInTransaction(
                tx,
                {
                  idempotencyKey:
                    `migration:phase8:agent-sale:${payment.txnId}`,
                  kind:
                    LedgerTransactionKind.AGENT_SALE,
                  referenceType:
                    'PaymentTransaction',
                  referenceId:
                    payment.txnId,
                  description:
                    'Phase 8 legacy agent cash sale backfill',
                  occurredAt:
                    payment.confirmedAt ??
                    payment.createdAt,
                  metadata:
                    this.json({
                      phase:
                        8,
                      legacy:
                        true,
                      gatewayReference:
                        payment.gatewayReference,
                    }),
                  lines: [
                    {
                      accountId:
                        receivable.accountId,
                      side:
                        LedgerEntrySide.DEBIT,
                      amountNgn:
                        payment.amountNgn,
                      memo:
                        'Legacy cash collected by agent',
                    },
                    {
                      accountId:
                        destination.accountId,
                      side:
                        LedgerEntrySide.CREDIT,
                      amountNgn:
                        payment.amountNgn,
                      memo:
                        disposition ===
                        'REVENUE'
                          ? 'Legacy ticket revenue'
                          : 'Legacy payment awaiting review',
                    },
                  ],
                },
              );

            await tx.paymentTransaction.update({
              where: {
                txnId:
                  payment.txnId,
              },
              data: {
                collectionLedgerTxnId:
                  posted.ledgerTxnId,
              },
            });

            return posted;
          },
          {
            isolationLevel:
              Prisma.TransactionIsolationLevel.Serializable,
          },
        );

      return {
        skipped: false,
        ledgerTxnId:
          journal.ledgerTxnId,
        result: {
          gateway:
            payment.gateway,
          disposition,
        },
      };
    }

    if (
      payment.gateway ===
        PaymentGateway.MONNIFY ||
      payment.gateway ===
        PaymentGateway.FLUTTERWAVE
    ) {
      const journal =
        await this.prisma.$transaction(
          (
            tx,
          ) =>
            this.paymentAccounting.recordProviderCollectionInTransaction(
              tx,
              {
                paymentTxnId:
                  payment.txnId,
                gateway:
                  payment.gateway,
                amountNgn:
                  payment.amountNgn,
                disposition,
                providerReference:
                  payment.gatewayReference,
                providerTransactionId:
                  payment.providerTransactionId,
                occurredAt:
                  payment.providerPaidAt ??
                  payment.confirmedAt ??
                  payment.createdAt,
              },
            ),
          {
            isolationLevel:
              Prisma.TransactionIsolationLevel.Serializable,
          },
        );

      return {
        skipped: false,
        ledgerTxnId:
          journal.ledgerTxnId,
        result: {
          gateway:
            payment.gateway,
          disposition,
        },
      };
    }

    if (
      payment.gateway ===
      PaymentGateway.PAYSTACK
    ) {
      const journal =
        await this.recordLegacyPaystackCollection(
          payment,
          disposition,
        );

      return {
        skipped: false,
        ledgerTxnId:
          journal.ledgerTxnId,
        result: {
          gateway:
            'PAYSTACK_LEGACY',
          disposition,
        },
      };
    }

    throw new ReviewRequiredError(
      `Unsupported legacy payment gateway ${payment.gateway}`,
    );
  }

  private async migrateWalletFunding(
    fundingId: string,
  ) {
    const funding =
      await this.prisma.walletFunding.findUnique({
        where: {
          fundingId,
        },
      });

    if (!funding) {
      throw new ReviewRequiredError(
        'Wallet funding row no longer exists',
      );
    }

    if (funding.ledgerTxnId) {
      return {
        skipped: true,
        ledgerTxnId:
          funding.ledgerTxnId,
        result: {
          reason:
            'Wallet funding already ledger-backed',
        },
      };
    }

    if (
      funding.status !==
      WalletFundingStatus.CREDITED
    ) {
      return {
        skipped: true,
        ledgerTxnId:
          null,
        result: {
          reason:
            `Wallet funding is ${funding.status}, not CREDITED`,
        },
      };
    }

    const counterCode =
      funding.gateway ===
      PaymentGateway.MONNIFY
        ? SYSTEM_LEDGER_ACCOUNT_CODES.MONNIFY_COLLECTION_CLEARING
        : funding.gateway ===
          PaymentGateway.FLUTTERWAVE
          ? SYSTEM_LEDGER_ACCOUNT_CODES.FLUTTERWAVE_CLEARING
          : funding.gateway ===
            PaymentGateway.PAYSTACK
            ? SYSTEM_LEDGER_ACCOUNT_CODES.PAYSTACK_CLEARING
            : null;

    if (!counterCode) {
      throw new ReviewRequiredError(
        `Unsupported legacy wallet funding gateway ${funding.gateway}`,
      );
    }

    const journal =
      await this.prisma.$transaction(
        async (
          tx,
        ) => {
          const current =
            await tx.walletFunding.findUniqueOrThrow({
              where: {
                fundingId,
              },
            });

          if (
            current.ledgerTxnId
          ) {
            return tx.ledgerTransaction.findUniqueOrThrow({
              where: {
                ledgerTxnId:
                  current.ledgerTxnId,
              },
            });
          }

          const counter =
            await this.requireAccount(
              tx,
              counterCode,
            );

          const posted =
            await this.wallets.creditInTransaction(
              tx,
              {
                walletId:
                  current.walletId,
                amountNgn:
                  current.amountNgn,
                counterAccountId:
                  counter.accountId,
                idempotencyKey:
                  `migration:phase8:wallet-funding:${current.fundingId}`,
                kind:
                  LedgerTransactionKind.FUNDING,
                referenceType:
                  'WalletFunding',
                referenceId:
                  current.fundingId,
                description:
                  'Phase 8 legacy wallet funding backfill',
                occurredAt:
                  current.creditedAt ??
                  current.initiatedAt,
                metadata:
                  this.json({
                    phase:
                      8,
                    legacy:
                      true,
                    gateway:
                      current.gateway,
                    gatewayReference:
                      current.gatewayReference,
                    providerTransactionId:
                      current.providerTransactionId,
                  }),
              },
            );

          await tx.walletFunding.update({
            where: {
              fundingId:
                current.fundingId,
            },
            data: {
              ledgerTxnId:
                posted.ledgerTxnId,
            },
          });

          return posted;
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );

    return {
      skipped: false,
      ledgerTxnId:
        journal.ledgerTxnId,
      result: {
        gateway:
          funding.gateway,
        amountNgn:
          funding.amountNgn,
      },
    };
  }

  private async migratePaymentRefund(
    txnId: string,
  ) {
    const payment =
      await this.prisma.paymentTransaction.findUnique({
        where: {
          txnId,
        },
      });

    if (!payment) {
      throw new ReviewRequiredError(
        'Refund payment row no longer exists',
      );
    }

    if (
      !payment.refundStatus
    ) {
      return {
        skipped: true,
        ledgerTxnId:
          null,
        result: {
          reason:
            'Payment no longer has a refund lifecycle',
        },
      };
    }

    if (
      !payment.collectionLedgerTxnId
    ) {
      throw new ReviewRequiredError(
        'Refund cannot migrate before the original collection journal exists',
      );
    }

    const source =
      await this.refundSource(
        payment.collectionLedgerTxnId,
      );

    let accrualTxnId =
      payment.refundAccrualLedgerTxnId;

    if (!accrualTxnId) {
      const accrual =
        await this.prisma.$transaction(
          (
            tx,
          ) =>
            this.paymentAccounting.recordRefundAccrualInTransaction(
              tx,
              {
                paymentTxnId:
                  payment.txnId,
                amountNgn:
                  payment.amountNgn,
                source,
                reason:
                  payment.refundReason ??
                  'Phase 8 legacy refund backfill',
              },
            ),
          {
            isolationLevel:
              Prisma.TransactionIsolationLevel.Serializable,
          },
        );

      accrualTxnId =
        accrual.ledgerTxnId;
    }

    let settlementTxnId =
      payment.refundSettlementLedgerTxnId;

    if (
      payment.refundStatus ===
      PaymentRefundStatus.SUCCEEDED &&
      !settlementTxnId
    ) {
      if (
        payment.gateway ===
          PaymentGateway.MONNIFY ||
        payment.gateway ===
          PaymentGateway.FLUTTERWAVE
      ) {
        const settlement =
          await this.prisma.$transaction(
            (
              tx,
            ) =>
              this.paymentAccounting.recordRefundSettlementInTransaction(
                tx,
                {
                  paymentTxnId:
                    payment.txnId,
                  gateway:
                    payment.gateway,
                  amountNgn:
                    payment.amountNgn,
                  providerReference:
                    payment.refundReference,
                },
              ),
            {
              isolationLevel:
                Prisma.TransactionIsolationLevel.Serializable,
            },
          );

        settlementTxnId =
          settlement.ledgerTxnId;
      } else if (
        payment.gateway ===
        PaymentGateway.PAYSTACK
      ) {
        const settlement =
          await this.recordLegacyPaystackRefundSettlement(
            payment,
          );

        settlementTxnId =
          settlement.ledgerTxnId;
      } else {
        throw new ReviewRequiredError(
          `Succeeded refund uses unsupported legacy gateway ${payment.gateway}`,
        );
      }
    }

    return {
      skipped:
        Boolean(
          payment.refundAccrualLedgerTxnId,
        ) &&
        (
          payment.refundStatus !==
            PaymentRefundStatus.SUCCEEDED ||
          Boolean(
            payment.refundSettlementLedgerTxnId,
          )
        ),
      ledgerTxnId:
        settlementTxnId ??
        accrualTxnId,
      result: {
        refundStatus:
          payment.refundStatus,
        accrualLedgerTxnId:
          accrualTxnId,
        settlementLedgerTxnId:
          settlementTxnId,
      },
    };
  }

  private async migratePrizeAccrual(
    claimId: string,
  ) {
    const result =
      await this.prisma.$transaction(
        async (
          tx,
        ) => {
          const claim =
            await tx.prizeClaim.findUnique({
              where: {
                claimId,
              },
              select: {
                claimId:
                  true,
                winnerTicketRef:
                  true,
                grossPrizeValueNgn:
                  true,
                whtAmountNgn:
                  true,
                netPrizeValueNgn:
                  true,
                prizeAccrualLedgerTxnId:
                  true,
              },
            });

          if (!claim) {
            throw new ReviewRequiredError(
              'Prize claim no longer exists',
            );
          }

          if (
            claim.prizeAccrualLedgerTxnId
          ) {
            return {
              skipped: true,
              ledgerTxnId:
                claim.prizeAccrualLedgerTxnId,
            };
          }

          const journal =
            await this.ensurePrizeAccrual(
              tx,
              claim,
            );

          return {
            skipped: false,
            ledgerTxnId:
              journal.ledgerTxnId,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );

    return {
      ...result,
      result: {
        claimId,
      },
    };
  }

  private async migrateAgentPrize(
    claimId: string,
  ) {
    const result =
      await this.prisma.$transaction(
        async (
          tx,
        ) => {
          await tx.$queryRaw`
            SELECT "claim_id"
            FROM "prize_claims"
            WHERE "claim_id" = ${claimId}
            FOR UPDATE
          `;

          const claim =
            await tx.prizeClaim.findUnique({
              where: {
                claimId,
              },
            });

          if (!claim) {
            throw new ReviewRequiredError(
              'Agent-paid prize claim no longer exists',
            );
          }

          if (
            claim.agentPayoutLedgerTxnId
          ) {
            return {
              skipped: true,
              ledgerTxnId:
                claim.agentPayoutLedgerTxnId,
            };
          }

          if (
            !claim.paidByAgentId
          ) {
            throw new ReviewRequiredError(
              'CASH_PAID claim has no paying agent',
            );
          }

          await this.ensurePrizeAccrual(
            tx,
            claim,
          );

          const payable =
            await this.requireAccount(
              tx,
              SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_PAYABLE,
            );

          const receivable =
            await this.ensureAgentReceivable(
              tx,
              claim.paidByAgentId,
            );

          const journal =
            await this.ledger.postInTransaction(
              tx,
              {
                idempotencyKey:
                  `migration:phase8:agent-prize:${claim.claimId}`,
                kind:
                  LedgerTransactionKind.PRIZE_PAYOUT,
                referenceType:
                  'PrizeClaim',
                referenceId:
                  claim.claimId,
                description:
                  'Phase 8 legacy agent prize payout backfill',
                occurredAt:
                  claim.paidByAgentAt ??
                  claim.fulfilledAt ??
                  claim.updatedAt,
                metadata:
                  this.json({
                    phase:
                      8,
                    legacy:
                      true,
                    agentId:
                      claim.paidByAgentId,
                    payoutReference:
                      claim.payoutReference,
                  }),
                lines: [
                  {
                    accountId:
                      payable.accountId,
                    side:
                      LedgerEntrySide.DEBIT,
                    amountNgn:
                      claim.netPrizeValueNgn,
                    memo:
                      'Settle legacy winner prize payable',
                  },
                  {
                    accountId:
                      receivable.accountId,
                    side:
                      LedgerEntrySide.CREDIT,
                    amountNgn:
                      claim.netPrizeValueNgn,
                    memo:
                      'Reduce legacy agent receivable',
                  },
                ],
              },
            );

          await tx.prizeClaim.update({
            where: {
              claimId:
                claim.claimId,
            },
            data: {
              agentPayoutLedgerTxnId:
                journal.ledgerTxnId,
            },
          });

          return {
            skipped: false,
            ledgerTxnId:
              journal.ledgerTxnId,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );

    return {
      ...result,
      result: {
        claimId,
      },
    };
  }

  private async migrateRemittance(
    remittanceId: string,
  ) {
    const journalIds:
      string[] =
        [];

    const remittance =
      await this.prisma.remittance.findUnique({
        where: {
          remittanceId,
        },
      });

    if (!remittance) {
      throw new ReviewRequiredError(
        'Remittance no longer exists',
      );
    }

    if (
      remittance.commissionNgn >
        0 &&
      !remittance.commissionLedgerTxnId
    ) {
      const commission =
        await this.prisma.$transaction(
          (
            tx,
          ) =>
            this.recordLegacyCommission(
              tx,
              remittanceId,
            ),
          {
            isolationLevel:
              Prisma.TransactionIsolationLevel.Serializable,
          },
        );

      if (commission) {
        journalIds.push(
          commission.ledgerTxnId,
        );
      }
    }

    if (
      remittance.amountDueNgn >
        0 &&
      remittance.status ===
        RemittanceStatus.RECEIVED &&
      !remittance.settlementLedgerTxnId &&
      !remittance.bankTransferRef?.startsWith(
        'WALLET-',
      )
    ) {
      if (
        !remittance.bankTransferRef
      ) {
        throw new ReviewRequiredError(
          'Received legacy remittance has no bank transfer reference',
        );
      }

      const settlement =
        await this.recordLegacyBankRemittance(
          remittanceId,
        );

      journalIds.push(
        settlement.ledgerTxnId,
      );
    }

    return {
      skipped:
        journalIds.length ===
        0,
      ledgerTxnId:
        journalIds.at(
          -1,
        ) ??
        remittance.settlementLedgerTxnId ??
        remittance.commissionLedgerTxnId,
      result: {
        journalTxnIds:
          journalIds,
        note:
          remittance.bankTransferRef?.startsWith(
            'WALLET-',
          )
            ? 'Legacy wallet settlement is handled by AGENT_WALLET_BALANCE migration'
            : null,
      },
    };
  }

  private async migrateAgentWallet(
    agentId: string,
    cutoverAt: Date,
  ) {
    const agent =
      await this.prisma.agent.findUnique({
        where: {
          agentId,
        },
      });

    if (!agent) {
      throw new ReviewRequiredError(
        'Agent no longer exists',
      );
    }

    const legacyRows =
      await this.prisma.remittance.findMany({
        where: {
          agentId,
          createdAt: {
            lt:
              cutoverAt,
          },
          OR: [
            {
              amountDueNgn: {
                lt:
                  0,
              },
            },
            {
              bankTransferRef: {
                startsWith:
                  'WALLET-',
              },
            },
          ],
        },
        orderBy: [
          {
            periodDate:
              'asc',
          },
          {
            createdAt:
              'asc',
          },
        ],
      });

    const legacyCredits =
      legacyRows
        .filter(
          (
            row,
          ) =>
            row.amountDueNgn <
            0,
        )
        .reduce(
          (
            sum,
            row,
          ) =>
            sum -
            row.amountDueNgn,
          0,
        );

    const legacyDebits =
      legacyRows
        .filter(
          (
            row,
          ) =>
            row.amountDueNgn >
              0 &&
            row.status ===
              RemittanceStatus.RECEIVED &&
            row.bankTransferRef?.startsWith(
              'WALLET-',
            ),
        )
        .reduce(
          (
            sum,
            row,
          ) =>
            sum +
            row.amountDueNgn,
          0,
        );

    const computedLegacyBalance =
      legacyCredits -
      legacyDebits;

    if (
      computedLegacyBalance !==
      agent.walletBalanceNgn
    ) {
      throw new ReviewRequiredError(
        `Legacy wallet does not reconcile from remittance history. stored=${agent.walletBalanceNgn}, computed=${computedLegacyBalance}`,
      );
    }

    const wallet =
      await this.wallets.ensureAgentWallet(
        agentId,
      );

    const journals:
      string[] =
        [];

    for (
      const row
      of legacyRows
    ) {
      if (
        row.amountDueNgn <
          0 &&
        !row.walletCreditLedgerTxnId
      ) {
        const journal =
          await this.prisma.$transaction(
            async (
              tx,
            ) => {
              await this.lockRemittance(
                tx,
                row.remittanceId,
              );

              const current =
                await tx.remittance.findUniqueOrThrow({
                  where: {
                    remittanceId:
                      row.remittanceId,
                  },
                });

              if (
                current.walletCreditLedgerTxnId
              ) {
                return tx.ledgerTransaction.findUniqueOrThrow({
                  where: {
                    ledgerTxnId:
                      current.walletCreditLedgerTxnId,
                  },
                });
              }

              const receivable =
                await this.ensureAgentReceivable(
                  tx,
                  agentId,
                );

              const posted =
                await this.wallets.creditInTransaction(
                  tx,
                  {
                    walletId:
                      wallet.walletId,
                    amountNgn:
                      -current.amountDueNgn,
                    counterAccountId:
                      receivable.accountId,
                    idempotencyKey:
                      `migration:phase8:legacy-wallet-credit:${current.remittanceId}`,
                    kind:
                      LedgerTransactionKind.AGENT_REMITTANCE,
                    referenceType:
                      'Remittance',
                    referenceId:
                      current.remittanceId,
                    description:
                      'Phase 8 legacy agent wallet credit backfill',
                    occurredAt:
                      current.receivedAt ??
                      current.periodDate,
                    metadata:
                      this.json({
                        phase:
                          8,
                        legacy:
                          true,
                        agentId,
                      }),
                  },
                );

              await tx.remittance.update({
                where: {
                  remittanceId:
                    current.remittanceId,
                },
                data: {
                  walletCreditLedgerTxnId:
                    posted.ledgerTxnId,
                },
              });

              return posted;
            },
            {
              isolationLevel:
                Prisma.TransactionIsolationLevel.Serializable,
            },
          );

        journals.push(
          journal.ledgerTxnId,
        );
      }

      if (
        row.amountDueNgn >
          0 &&
        row.status ===
          RemittanceStatus.RECEIVED &&
        row.bankTransferRef?.startsWith(
          'WALLET-',
        ) &&
        !row.settlementLedgerTxnId
      ) {
        const journal =
          await this.prisma.$transaction(
            async (
              tx,
            ) => {
              await this.lockRemittance(
                tx,
                row.remittanceId,
              );

              const current =
                await tx.remittance.findUniqueOrThrow({
                  where: {
                    remittanceId:
                      row.remittanceId,
                  },
                });

              if (
                current.settlementLedgerTxnId
              ) {
                return tx.ledgerTransaction.findUniqueOrThrow({
                  where: {
                    ledgerTxnId:
                      current.settlementLedgerTxnId,
                  },
                });
              }

              const receivable =
                await this.ensureAgentReceivable(
                  tx,
                  agentId,
                );

              const posted =
                await this.wallets.debitInTransaction(
                  tx,
                  {
                    walletId:
                      wallet.walletId,
                    amountNgn:
                      current.amountDueNgn,
                    counterAccountId:
                      receivable.accountId,
                    idempotencyKey:
                      `migration:phase8:legacy-wallet-settlement:${current.remittanceId}`,
                    kind:
                      LedgerTransactionKind.AGENT_REMITTANCE,
                    referenceType:
                      'Remittance',
                    referenceId:
                      current.remittanceId,
                    description:
                      'Phase 8 legacy wallet remittance settlement backfill',
                    occurredAt:
                      current.receivedAt ??
                      current.updatedAt,
                    metadata:
                      this.json({
                        phase:
                          8,
                        legacy:
                          true,
                        agentId,
                        bankTransferRef:
                          current.bankTransferRef,
                      }),
                  },
                );

              await tx.remittance.update({
                where: {
                  remittanceId:
                    current.remittanceId,
                },
                data: {
                  settlementLedgerTxnId:
                    posted.ledgerTxnId,
                },
              });

              return posted;
            },
            {
              isolationLevel:
                Prisma.TransactionIsolationLevel.Serializable,
            },
          );

        journals.push(
          journal.ledgerTxnId,
        );
      }
    }

    const cleared =
      await this.prisma.agent.updateMany({
        where: {
          agentId,
          walletBalanceNgn:
            agent.walletBalanceNgn,
        },
        data: {
          walletBalanceNgn:
            0,
        },
      });

    if (
      cleared.count !==
      1
    ) {
      throw new ConflictException(
        'Legacy agent wallet changed during migration',
      );
    }

    return {
      skipped:
        journals.length ===
          0 &&
        agent.walletBalanceNgn ===
          0,
      ledgerTxnId:
        journals.at(
          -1,
        ) ??
        null,
      result: {
        legacyCreditsNgn:
          legacyCredits,
        legacyDebitsNgn:
          legacyDebits,
        migratedLegacyBalanceNgn:
          computedLegacyBalance,
        journalTxnIds:
          journals,
      },
    };
  }

  private async migratePrizePayoutHistory(
    claimId: string,
  ) {
    return this.prisma.$transaction(
      async (
        tx,
      ) => {
        await tx.$queryRaw`
          SELECT "claim_id"
          FROM "prize_claims"
          WHERE "claim_id" = ${claimId}
          FOR UPDATE
        `;

        const claim =
          await tx.prizeClaim.findUnique({
            where: {
              claimId,
            },
            include: {
              payoutAttempts:
                true,
            },
          });

        if (!claim) {
          throw new ReviewRequiredError(
            'Prize payout claim no longer exists',
          );
        }

        if (
          claim.payoutAttempts.length >
          0
        ) {
          return {
            skipped: true,
            ledgerTxnId:
              claim.payoutAttempts.at(
                -1,
              )?.payoutLedgerTxnId ??
              null,
            result: {
              reason:
                'Payout attempt history already exists',
            },
          };
        }

        if (
          !claim.payoutStatus
        ) {
          return {
            skipped: true,
            ledgerTxnId:
              null,
            result: {
              reason:
                'Claim no longer has legacy payout state',
            },
          };
        }

        if (
          claim.paidByAgentId
        ) {
          throw new ReviewRequiredError(
            'Claim has both bank payout summary and paidByAgentId',
          );
        }

        const provider =
          claim.payoutProvider
            ?.trim()
            .toUpperCase();

        if (
          provider !==
            'MONNIFY' &&
          provider !==
            'FLUTTERWAVE'
        ) {
          throw new ReviewRequiredError(
            `Legacy payout provider is not migratable: ${claim.payoutProvider ?? 'missing'}`,
          );
        }

        if (
          claim.payoutStatus ===
          PrizePayoutStatus.REVERSED
        ) {
          throw new ReviewRequiredError(
            'Legacy REVERSED payout needs Finance review before reconstructing success and reversal journals',
          );
        }

        const bankCode =
          claim.kycBankCode
            ?.trim();

        const last4 =
          (
            claim.payoutAccountNumber
              ?.replace(
                /\D/g,
                '',
              )
              .slice(
                -4,
              ) ??
            claim.kycBankAccountLast4
          )
            ?.trim();

        const accountName =
          claim.kycBankAccountName
            ?.trim()
            .replace(
              /\s+/g,
              ' ',
            )
            .toUpperCase();

        if (
          !bankCode ||
          !last4 ||
          !/^\d{4}$/.test(
            last4,
          ) ||
          !accountName
        ) {
          throw new ReviewRequiredError(
            'Legacy payout destination identity is incomplete',
          );
        }

        const accountNameHash =
          createHash(
            'sha256',
          )
            .update(
              accountName,
            )
            .digest(
              'hex',
            );

        const legacyKey =
          claim.payoutIdempotencyKey
            ?.trim()
            .toLowerCase();

        const idempotencyKey =
          legacyKey &&
          /^[a-z0-9_-]{16,50}$/.test(
            legacyKey,
          )
            ? legacyKey
            : `mig-prize-${claim.claimId}`;

        const providerReference =
          claim.payoutReference
            ?.trim() ||
          (
            claim.payoutStatus ===
              PrizePayoutStatus.FAILED
              ? null
              : claim.payoutIdempotencyKey
                ?.trim() ??
                null
          );

        if (
          (
            [
              PrizePayoutStatus.REQUESTED,
              PrizePayoutStatus.SUBMITTED,
              PrizePayoutStatus.PROCESSING,
              PrizePayoutStatus.UNKNOWN,
              PrizePayoutStatus.SUCCEEDED,
            ] as PrizePayoutStatus[]
          ).includes(
            claim.payoutStatus,
          ) &&
          !providerReference
        ) {
          throw new ReviewRequiredError(
            'Legacy non-failed payout has no trustworthy provider/reference identifier',
          );
        }

        const duplicateReference =
          providerReference
            ? await tx.prizePayoutAttempt.findFirst({
                where: {
                  provider,
                  providerReference,
                },
              })
            : null;

        if (duplicateReference) {
          throw new ReviewRequiredError(
            `Provider reference already belongs to attempt ${duplicateReference.attemptId}`,
          );
        }

        const attempt =
          await tx.prizePayoutAttempt.create({
            data: {
              claimId:
                claim.claimId,
              attemptNumber:
                1,
              provider,
              idempotencyKey,
              amountNgn:
                claim.netPrizeValueNgn,
              currency:
                'NGN',
              status:
                claim.payoutStatus ===
                PrizePayoutStatus.SUCCEEDED
                  ? PrizePayoutStatus.REQUESTED
                  : claim.payoutStatus,
              providerReference,
              rawStatus:
                'PHASE8_LEGACY_IMPORT',
              failureReason:
                claim.payoutFailureReason,
              destinationBankCode:
                bankCode,
              destinationAccountLast4:
                last4,
              destinationAccountNameHash:
                accountNameHash,
              initiatedByAdminId:
                'phase8-migration',
              initiatedAt:
                claim.payoutInitiatedAt ??
                claim.createdAt,
              lastCheckedAt:
                claim.payoutLastCheckedAt,
            },
          });

        if (
          claim.payoutStatus !==
          PrizePayoutStatus.SUCCEEDED
        ) {
          return {
            skipped: false,
            ledgerTxnId:
              null,
            result: {
              attemptId:
                attempt.attemptId,
              status:
                claim.payoutStatus,
            },
          };
        }

        if (
          claim.status !==
          PrizeClaimStatus.CASH_PAID
        ) {
          throw new ReviewRequiredError(
            'Legacy payout says SUCCEEDED but claim is not CASH_PAID',
          );
        }

        await this.ensurePrizeAccrual(
          tx,
          claim,
        );

        const payable =
          await this.requireAccount(
            tx,
            SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_PAYABLE,
          );

        const clearing =
          await this.requireAccount(
            tx,
            provider ===
              'MONNIFY'
              ? SYSTEM_LEDGER_ACCOUNT_CODES.MONNIFY_PAYOUT_CLEARING
              : SYSTEM_LEDGER_ACCOUNT_CODES.FLUTTERWAVE_PAYOUT_CLEARING,
          );

        const journal =
          await this.ledger.postInTransaction(
            tx,
            {
              idempotencyKey:
                `migration:phase8:prize-payout:${claim.claimId}`,
              kind:
                LedgerTransactionKind.PRIZE_PAYOUT,
              referenceType:
                'PrizePayoutAttempt',
              referenceId:
                attempt.attemptId,
              description:
                'Phase 8 legacy bank prize payout backfill',
              occurredAt:
                claim.payoutCompletedAt ??
                claim.fulfilledAt ??
                claim.updatedAt,
              metadata:
                this.json({
                  phase:
                    8,
                  legacy:
                    true,
                  claimId:
                    claim.claimId,
                  provider,
                  providerReference,
                }),
              lines: [
                {
                  accountId:
                    payable.accountId,
                  side:
                    LedgerEntrySide.DEBIT,
                  amountNgn:
                    claim.netPrizeValueNgn,
                  memo:
                    'Settle legacy prize payable',
                },
                {
                  accountId:
                    clearing.accountId,
                  side:
                    LedgerEntrySide.CREDIT,
                  amountNgn:
                    claim.netPrizeValueNgn,
                  memo:
                    'Legacy provider payout clearing',
                },
              ],
            },
          );

        await tx.prizePayoutAttempt.update({
          where: {
            attemptId:
              attempt.attemptId,
          },
          data: {
            status:
              PrizePayoutStatus.SUCCEEDED,
            completedAt:
              claim.payoutCompletedAt ??
              claim.fulfilledAt ??
              claim.updatedAt,
            payoutLedgerTxnId:
              journal.ledgerTxnId,
          },
        });

        return {
          skipped: false,
          ledgerTxnId:
            journal.ledgerTxnId,
          result: {
            attemptId:
              attempt.attemptId,
            status:
              PrizePayoutStatus.SUCCEEDED,
          },
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async planAgentWallets(
    runId: string,
    cutoverAt: Date,
    items: Prisma.FinancialMigrationItemCreateManyInput[],
  ) {
    const agents =
      await this.prisma.agent.findMany({
        where: {
          OR: [
            {
              walletBalanceNgn: {
                not:
                  0,
              },
            },
            {
              remittances: {
                some: {
                  createdAt: {
                    lt:
                      cutoverAt,
                  },
                  OR: [
                    {
                      amountDueNgn: {
                        lt:
                          0,
                      },
                    },
                    {
                      bankTransferRef: {
                        startsWith:
                          'WALLET-',
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
        select: {
          agentId:
            true,
          agentCode:
            true,
          walletBalanceNgn:
            true,
        },
      });

    for (
      const agent
      of agents
    ) {
      items.push({
        runId,
        kind:
          FinancialMigrationKind.AGENT_WALLET_BALANCE,
        sourceType:
          'Agent',
        sourceId:
          agent.agentId,
        snapshot:
          this.json({
            agentCode:
              agent.agentCode,
            walletBalanceNgn:
              agent.walletBalanceNgn,
          }),
      });
    }
  }

  private async planPayments(
    runId: string,
    cutoverAt: Date,
    items: Prisma.FinancialMigrationItemCreateManyInput[],
  ) {
    const rows =
      await this.prisma.paymentTransaction.findMany({
        where: {
          createdAt: {
            lt:
              cutoverAt,
          },
          collectionLedgerTxnId:
            null,
          status: {
            in:
              MIGRATABLE_PAYMENT_STATUSES,
          },
        },
        select: {
          txnId:
            true,
          gateway:
            true,
          amountNgn:
            true,
          status:
            true,
          gatewayReference:
            true,
        },
      });

    for (
      const row
      of rows
    ) {
      items.push({
        runId,
        kind:
          FinancialMigrationKind.PAYMENT_COLLECTION,
        sourceType:
          'PaymentTransaction',
        sourceId:
          row.txnId,
        snapshot:
          this.json(
            row,
          ),
      });
    }
  }

  private async planWalletFundings(
    runId: string,
    cutoverAt: Date,
    items: Prisma.FinancialMigrationItemCreateManyInput[],
  ) {
    const rows =
      await this.prisma.walletFunding.findMany({
        where: {
          initiatedAt: {
            lt:
              cutoverAt,
          },
          status:
            WalletFundingStatus.CREDITED,
          ledgerTxnId:
            null,
        },
        select: {
          fundingId:
            true,
          gateway:
            true,
          amountNgn:
            true,
          gatewayReference:
            true,
          initiatedAt:
            true,
          creditedAt:
            true,
        },
      });

    for (
      const row
      of rows
    ) {
      items.push({
        runId,
        kind:
          FinancialMigrationKind.WALLET_FUNDING,
        sourceType:
          'WalletFunding',
        sourceId:
          row.fundingId,
        snapshot:
          this.json(
            row,
          ),
      });
    }
  }

  private async planRefunds(
    runId: string,
    cutoverAt: Date,
    items: Prisma.FinancialMigrationItemCreateManyInput[],
  ) {
    const rows =
      await this.prisma.paymentTransaction.findMany({
        where: {
          createdAt: {
            lt:
              cutoverAt,
          },
          refundStatus: {
            not:
              null,
          },
          OR: [
            {
              refundAccrualLedgerTxnId:
                null,
            },
            {
              refundStatus:
                PaymentRefundStatus.SUCCEEDED,
              refundSettlementLedgerTxnId:
                null,
            },
          ],
        },
        select: {
          txnId:
            true,
          gateway:
            true,
          amountNgn:
            true,
          refundStatus:
            true,
          refundReference:
            true,
        },
      });

    for (
      const row
      of rows
    ) {
      items.push({
        runId,
        kind:
          FinancialMigrationKind.PAYMENT_REFUND,
        sourceType:
          'PaymentTransaction',
        sourceId:
          row.txnId,
        snapshot:
          this.json(
            row,
          ),
      });
    }
  }

  private async planPrizeAccruals(
    runId: string,
    cutoverAt: Date,
    items: Prisma.FinancialMigrationItemCreateManyInput[],
  ) {
    const rows =
      await this.prisma.prizeClaim.findMany({
        where: {
          createdAt: {
            lt:
              cutoverAt,
          },
          claimType:
            'CASH',
          status: {
            in: [
              PrizeClaimStatus.KYC_CLEARED,
              PrizeClaimStatus.CASH_PAID,
            ],
          },
          prizeAccrualLedgerTxnId:
            null,
        },
        select: {
          claimId:
            true,
          winnerTicketRef:
            true,
          grossPrizeValueNgn:
            true,
          whtAmountNgn:
            true,
          netPrizeValueNgn:
            true,
        },
      });

    for (
      const row
      of rows
    ) {
      items.push({
        runId,
        kind:
          FinancialMigrationKind.PRIZE_ACCRUAL,
        sourceType:
          'PrizeClaim',
        sourceId:
          row.claimId,
        snapshot:
          this.json(
            row,
          ),
      });
    }
  }

  private async planAgentPrizes(
    runId: string,
    cutoverAt: Date,
    items: Prisma.FinancialMigrationItemCreateManyInput[],
  ) {
    const rows =
      await this.prisma.prizeClaim.findMany({
        where: {
          createdAt: {
            lt:
              cutoverAt,
          },
          status:
            PrizeClaimStatus.CASH_PAID,
          paidByAgentId: {
            not:
              null,
          },
          agentPayoutLedgerTxnId:
            null,
        },
        select: {
          claimId:
            true,
          paidByAgentId:
            true,
          netPrizeValueNgn:
            true,
        },
      });

    for (
      const row
      of rows
    ) {
      items.push({
        runId,
        kind:
          FinancialMigrationKind.AGENT_PRIZE_PAYOUT,
        sourceType:
          'PrizeClaim',
        sourceId:
          row.claimId,
        snapshot:
          this.json(
            row,
          ),
      });
    }
  }

  private async planRemittances(
    runId: string,
    cutoverAt: Date,
    items: Prisma.FinancialMigrationItemCreateManyInput[],
  ) {
    const rows =
      await this.prisma.remittance.findMany({
        where: {
          createdAt: {
            lt:
              cutoverAt,
          },
          OR: [
            {
              commissionNgn: {
                gt:
                  0,
              },
              commissionLedgerTxnId:
                null,
            },
            {
              amountDueNgn: {
                gt:
                  0,
              },
              status:
                RemittanceStatus.RECEIVED,
              settlementLedgerTxnId:
                null,
            },
          ],
        },
        select: {
          remittanceId:
            true,
          agentId:
            true,
          periodDate:
            true,
          amountDueNgn:
            true,
          commissionNgn:
            true,
          status:
            true,
          bankTransferRef:
            true,
        },
      });

    for (
      const row
      of rows
    ) {
      items.push({
        runId,
        kind:
          FinancialMigrationKind.REMITTANCE_ACCOUNTING,
        sourceType:
          'Remittance',
        sourceId:
          row.remittanceId,
        snapshot:
          this.json(
            row,
          ),
      });
    }
  }

  private async planPrizePayoutHistory(
    runId: string,
    cutoverAt: Date,
    items: Prisma.FinancialMigrationItemCreateManyInput[],
  ) {
    const rows =
      await this.prisma.prizeClaim.findMany({
        where: {
          createdAt: {
            lt:
              cutoverAt,
          },
          paidByAgentId:
            null,
          payoutStatus: {
            not:
              null,
          },
          payoutAttempts: {
            none:
              {},
          },
        },
        select: {
          claimId:
            true,
          payoutStatus:
            true,
          payoutProvider:
            true,
          payoutReference:
            true,
          netPrizeValueNgn:
            true,
        },
      });

    for (
      const row
      of rows
    ) {
      items.push({
        runId,
        kind:
          FinancialMigrationKind.PRIZE_PAYOUT_HISTORY,
        sourceType:
          'PrizeClaim',
        sourceId:
          row.claimId,
        snapshot:
          this.json(
            row,
          ),
      });
    }
  }

  private async recordLegacyPaystackCollection(
    payment: {
      txnId: string;
      amountNgn: number;
      gatewayReference: string;
      providerTransactionId: string | null;
      providerPaidAt: Date | null;
      confirmedAt: Date | null;
      createdAt: Date;
    },
    disposition:
      | 'REVENUE'
      | 'SUSPENSE',
  ) {
    return this.prisma.$transaction(
      async (
        tx,
      ) => {
        const current =
          await tx.paymentTransaction.findUniqueOrThrow({
            where: {
              txnId:
                payment.txnId,
            },
          });

        if (
          current.collectionLedgerTxnId
        ) {
          return tx.ledgerTransaction.findUniqueOrThrow({
            where: {
              ledgerTxnId:
                current.collectionLedgerTxnId,
            },
          });
        }

        const clearing =
          await this.requireAccount(
            tx,
            SYSTEM_LEDGER_ACCOUNT_CODES.PAYSTACK_CLEARING,
          );

        const destination =
          await this.requireAccount(
            tx,
            disposition ===
            'REVENUE'
              ? SYSTEM_LEDGER_ACCOUNT_CODES.TICKET_SALES_REVENUE
              : SYSTEM_LEDGER_ACCOUNT_CODES.SUSPENSE,
          );

        const journal =
          await this.ledger.postInTransaction(
            tx,
            {
              idempotencyKey:
                `migration:phase8:paystack-collection:${payment.txnId}`,
              kind:
                LedgerTransactionKind.PROVIDER_COLLECTION,
              referenceType:
                'PaymentTransaction',
              referenceId:
                payment.txnId,
              description:
                'Phase 8 legacy Paystack collection backfill',
              occurredAt:
                payment.providerPaidAt ??
                payment.confirmedAt ??
                payment.createdAt,
              metadata:
                this.json({
                  phase:
                    8,
                  legacy:
                    true,
                  provider:
                    'PAYSTACK',
                  providerReference:
                    payment.gatewayReference,
                  providerTransactionId:
                    payment.providerTransactionId,
                }),
              lines: [
                {
                  accountId:
                    clearing.accountId,
                  side:
                    LedgerEntrySide.DEBIT,
                  amountNgn:
                    payment.amountNgn,
                  memo:
                    'Legacy Paystack funds received',
                },
                {
                  accountId:
                    destination.accountId,
                  side:
                    LedgerEntrySide.CREDIT,
                  amountNgn:
                    payment.amountNgn,
                  memo:
                    disposition ===
                    'REVENUE'
                      ? 'Legacy ticket sales revenue'
                      : 'Legacy successful collection awaiting review',
                },
              ],
            },
          );

        await tx.paymentTransaction.update({
          where: {
            txnId:
              payment.txnId,
          },
          data: {
            collectionLedgerTxnId:
              journal.ledgerTxnId,
          },
        });

        return journal;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async recordLegacyPaystackRefundSettlement(
    payment: {
      txnId: string;
      amountNgn: number;
      refundAccrualLedgerTxnId: string | null;
      refundSettlementLedgerTxnId: string | null;
      refundReference: string | null;
    },
  ) {
    return this.prisma.$transaction(
      async (
        tx,
      ) => {
        const current =
          await tx.paymentTransaction.findUniqueOrThrow({
            where: {
              txnId:
                payment.txnId,
            },
          });

        if (
          current.refundSettlementLedgerTxnId
        ) {
          return tx.ledgerTransaction.findUniqueOrThrow({
            where: {
              ledgerTxnId:
                current.refundSettlementLedgerTxnId,
            },
          });
        }

        if (
          !current.refundAccrualLedgerTxnId
        ) {
          throw new ReviewRequiredError(
            'Legacy Paystack refund settlement has no refund accrual',
          );
        }

        const payable =
          await this.requireAccount(
            tx,
            SYSTEM_LEDGER_ACCOUNT_CODES.REFUND_PAYABLE,
          );

        const clearing =
          await this.requireAccount(
            tx,
            SYSTEM_LEDGER_ACCOUNT_CODES.PAYSTACK_CLEARING,
          );

        const journal =
          await this.ledger.postInTransaction(
            tx,
            {
              idempotencyKey:
                `migration:phase8:paystack-refund:${payment.txnId}`,
              kind:
                LedgerTransactionKind.REFUND_SETTLEMENT,
              referenceType:
                'PaymentTransaction',
              referenceId:
                payment.txnId,
              description:
                'Phase 8 legacy Paystack refund settlement backfill',
              metadata:
                this.json({
                  phase:
                    8,
                  legacy:
                    true,
                  provider:
                    'PAYSTACK',
                  refundReference:
                    payment.refundReference,
                }),
              lines: [
                {
                  accountId:
                    payable.accountId,
                  side:
                    LedgerEntrySide.DEBIT,
                  amountNgn:
                    payment.amountNgn,
                  memo:
                    'Settle legacy customer refund payable',
                },
                {
                  accountId:
                    clearing.accountId,
                  side:
                    LedgerEntrySide.CREDIT,
                  amountNgn:
                    payment.amountNgn,
                  memo:
                    'Legacy Paystack refund money out',
                },
              ],
            },
          );

        await tx.paymentTransaction.update({
          where: {
            txnId:
              payment.txnId,
          },
          data: {
            refundSettlementLedgerTxnId:
              journal.ledgerTxnId,
          },
        });

        return journal;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async recordLegacyCommission(
    tx: Prisma.TransactionClient,
    remittanceId: string,
  ) {
    const remittance =
      await tx.remittance.findUniqueOrThrow({
        where: {
          remittanceId,
        },
      });

    if (
      remittance.commissionLedgerTxnId
    ) {
      return tx.ledgerTransaction.findUniqueOrThrow({
        where: {
          ledgerTxnId:
            remittance.commissionLedgerTxnId,
        },
      });
    }

    if (
      remittance.commissionNgn <=
      0
    ) {
      return null;
    }

    const expense =
      await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES.AGENT_COMMISSION_EXPENSE,
      );

    const receivable =
      await this.ensureAgentReceivable(
        tx,
        remittance.agentId,
      );

    const journal =
      await this.ledger.postInTransaction(
        tx,
        {
          idempotencyKey:
            `migration:phase8:commission:${remittance.remittanceId}`,
          kind:
            LedgerTransactionKind.COMMISSION,
          referenceType:
            'Remittance',
          referenceId:
            remittance.remittanceId,
          description:
            'Phase 8 legacy agent commission backfill',
          occurredAt:
            remittance.periodDate,
          metadata:
            this.json({
              phase:
                8,
              legacy:
                true,
              agentId:
                remittance.agentId,
            }),
          lines: [
            {
              accountId:
                expense.accountId,
              side:
                LedgerEntrySide.DEBIT,
              amountNgn:
                remittance.commissionNgn,
              memo:
                'Legacy agent commission expense',
            },
            {
              accountId:
                receivable.accountId,
              side:
                LedgerEntrySide.CREDIT,
              amountNgn:
                remittance.commissionNgn,
              memo:
                'Legacy commission retained by agent',
            },
          ],
        },
      );

    await tx.remittance.update({
      where: {
        remittanceId:
          remittance.remittanceId,
      },
      data: {
        commissionLedgerTxnId:
          journal.ledgerTxnId,
      },
    });

    return journal;
  }

  private async recordLegacyBankRemittance(
    remittanceId: string,
  ) {
    return this.prisma.$transaction(
      async (
        tx,
      ) => {
        await this.lockRemittance(
          tx,
          remittanceId,
        );

        const remittance =
          await tx.remittance.findUniqueOrThrow({
            where: {
              remittanceId,
            },
          });

        if (
          remittance.settlementLedgerTxnId
        ) {
          return tx.ledgerTransaction.findUniqueOrThrow({
            where: {
              ledgerTxnId:
                remittance.settlementLedgerTxnId,
            },
          });
        }

        const bank =
          await this.requireAccount(
            tx,
            SYSTEM_LEDGER_ACCOUNT_CODES.BANK_CASH,
          );

        const receivable =
          await this.ensureAgentReceivable(
            tx,
            remittance.agentId,
          );

        const journal =
          await this.ledger.postInTransaction(
            tx,
            {
              idempotencyKey:
                `migration:phase8:bank-remittance:${remittance.remittanceId}`,
              kind:
                LedgerTransactionKind.AGENT_REMITTANCE,
              referenceType:
                'Remittance',
              referenceId:
                remittance.remittanceId,
              description:
                'Phase 8 legacy bank remittance backfill',
              occurredAt:
                remittance.receivedAt ??
                remittance.updatedAt,
              metadata:
                this.json({
                  phase:
                    8,
                  legacy:
                    true,
                  agentId:
                    remittance.agentId,
                  bankTransferRef:
                    remittance.bankTransferRef,
                }),
              lines: [
                {
                  accountId:
                    bank.accountId,
                  side:
                    LedgerEntrySide.DEBIT,
                  amountNgn:
                    remittance.amountDueNgn,
                  memo:
                    'Legacy cash received from agent',
                },
                {
                  accountId:
                    receivable.accountId,
                  side:
                    LedgerEntrySide.CREDIT,
                  amountNgn:
                    remittance.amountDueNgn,
                  memo:
                    'Clear legacy agent receivable',
                },
              ],
            },
          );

        await tx.remittance.update({
          where: {
            remittanceId:
              remittance.remittanceId,
          },
          data: {
            settlementLedgerTxnId:
              journal.ledgerTxnId,
          },
        });

        return journal;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async ensurePrizeAccrual(
    tx: Prisma.TransactionClient,
    claim: {
      claimId: string;
      winnerTicketRef: string;
      grossPrizeValueNgn: number;
      whtAmountNgn: number;
      netPrizeValueNgn: number;
      prizeAccrualLedgerTxnId: string | null;
    },
  ) {
    if (
      claim.prizeAccrualLedgerTxnId
    ) {
      return tx.ledgerTransaction.findUniqueOrThrow({
        where: {
          ledgerTxnId:
            claim.prizeAccrualLedgerTxnId,
        },
      });
    }

    if (
      claim.grossPrizeValueNgn <=
        0 ||
      claim.netPrizeValueNgn <=
        0 ||
      claim.whtAmountNgn <
        0 ||
      claim.grossPrizeValueNgn !==
        claim.netPrizeValueNgn +
        claim.whtAmountNgn
    ) {
      throw new ReviewRequiredError(
        'Prize gross/net/WHT values do not balance',
      );
    }

    const expense =
      await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_EXPENSE,
      );

    const payable =
      await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_PAYABLE,
      );

    const lines = [
      {
        accountId:
          expense.accountId,
        side:
          LedgerEntrySide.DEBIT,
        amountNgn:
          claim.grossPrizeValueNgn,
        memo:
          'Recognise legacy prize expense',
      },
      {
        accountId:
          payable.accountId,
        side:
          LedgerEntrySide.CREDIT,
        amountNgn:
          claim.netPrizeValueNgn,
        memo:
          'Legacy winner prize payable',
      },
    ];

    if (
      claim.whtAmountNgn >
      0
    ) {
      const wht =
        await this.requireAccount(
          tx,
          SYSTEM_LEDGER_ACCOUNT_CODES.WHT_PAYABLE,
        );

      lines.push({
        accountId:
          wht.accountId,
        side:
          LedgerEntrySide.CREDIT,
        amountNgn:
          claim.whtAmountNgn,
        memo:
          'Legacy WHT payable',
      });
    }

    const journal =
      await this.ledger.postInTransaction(
        tx,
        {
          idempotencyKey:
            `migration:phase8:prize-accrual:${claim.claimId}`,
          kind:
            LedgerTransactionKind.PRIZE_ACCRUAL,
          referenceType:
            'PrizeClaim',
          referenceId:
            claim.claimId,
          description:
            'Phase 8 legacy prize accrual backfill',
          metadata:
            this.json({
              phase:
                8,
              legacy:
                true,
              winnerTicketRef:
                claim.winnerTicketRef,
            }),
          lines,
        },
      );

    await tx.prizeClaim.update({
      where: {
        claimId:
          claim.claimId,
      },
      data: {
        prizeAccrualLedgerTxnId:
          journal.ledgerTxnId,
      },
    });

    return journal;
  }

  private async ensureAgentReceivable(
    tx: Prisma.TransactionClient,
    agentId: string,
  ) {
    const code =
      `AGENT:${agentId.toUpperCase()}:RECEIVABLE`;

    await tx.ledgerAccount.createMany({
      data: [
        {
          code,
          name:
            'Agent Receivable',
          accountType:
            LedgerAccountType.ASSET,
          purpose:
            LedgerAccountPurpose.AGENT_RECEIVABLE,
          ownerType:
            LedgerOwnerType.AGENT,
          ownerId:
            agentId,
          currency:
            'NGN',
        },
      ],
      skipDuplicates:
        true,
    });

    const account =
      await tx.ledgerAccount.findUniqueOrThrow({
        where: {
          code,
        },
      });

    if (
      account.accountType !==
        LedgerAccountType.ASSET ||
      account.purpose !==
        LedgerAccountPurpose.AGENT_RECEIVABLE ||
      account.ownerType !==
        LedgerOwnerType.AGENT ||
      account.ownerId !==
        agentId ||
      account.currency !==
        'NGN'
    ) {
      throw new ConflictException(
        'Agent receivable ledger account identity mismatch',
      );
    }

    return account;
  }

  private async refundSource(
    collectionLedgerTxnId: string,
  ): Promise<
    | 'REVENUE'
    | 'SUSPENSE'
  > {
    const journal =
      await this.prisma.ledgerTransaction.findUnique({
        where: {
          ledgerTxnId:
            collectionLedgerTxnId,
        },
        include: {
          entries: {
            include: {
              account:
                true,
            },
          },
        },
      });

    if (!journal) {
      throw new ReviewRequiredError(
        'Collection ledger transaction cannot be found',
      );
    }

    if (
      journal.entries.some(
        (
          entry,
        ) =>
          entry.side ===
            LedgerEntrySide.CREDIT &&
          entry.account.code ===
            SYSTEM_LEDGER_ACCOUNT_CODES.TICKET_SALES_REVENUE,
      )
    ) {
      return 'REVENUE';
    }

    if (
      journal.entries.some(
        (
          entry,
        ) =>
          entry.side ===
            LedgerEntrySide.CREDIT &&
          entry.account.code ===
            SYSTEM_LEDGER_ACCOUNT_CODES.SUSPENSE,
      )
    ) {
      return 'SUSPENSE';
    }

    throw new ReviewRequiredError(
      'Could not determine refund source from collection journal',
    );
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

  private lockRemittance(
    tx: Prisma.TransactionClient,
    remittanceId: string,
  ) {
    return tx.$queryRaw`
      SELECT "remittance_id"
      FROM "remittances"
      WHERE "remittance_id" = ${remittanceId}
      FOR UPDATE
    `;
  }

  private async refreshRunCounts(
    runId: string,
    markCompleted: boolean,
  ) {
    const counts =
      await this.itemCounts(
        runId,
      );

    const status =
      markCompleted
        ? counts.failed >
            0 ||
          counts.review >
            0
          ? FinancialMigrationRunStatus.COMPLETED_WITH_EXCEPTIONS
          : FinancialMigrationRunStatus.COMPLETED
        : undefined;

    await this.prisma.financialMigrationRun.update({
      where: {
        runId,
      },
      data: {
        appliedCount:
          counts.applied,
        skippedCount:
          counts.skipped,
        reviewCount:
          counts.review,
        failedCount:
          counts.failed,
        ...(status
          ? {
              status,
              completedAt:
                new Date(),
            }
          : {}),
      },
    });
  }

  private async itemCounts(
    runId: string,
  ) {
    const groups =
      await this.prisma.financialMigrationItem.groupBy({
        by: [
          'status',
        ],
        where: {
          runId,
        },
        _count:
          true,
      });

    const count =
      (
        status: FinancialMigrationItemStatus,
      ) =>
        groups.find(
          (
            row,
          ) =>
            row.status ===
            status,
        )?._count ??
        0;

    return {
      pending:
        count(
          FinancialMigrationItemStatus.PENDING,
        ),
      applied:
        count(
          FinancialMigrationItemStatus.APPLIED,
        ),
      skipped:
        count(
          FinancialMigrationItemStatus.SKIPPED,
        ),
      review:
        count(
          FinancialMigrationItemStatus.REVIEW_REQUIRED,
        ),
      failed:
        count(
          FinancialMigrationItemStatus.FAILED,
        ),
    };
  }

  private async auditOutstanding(
    cutoverAt: Date,
  ) {
    const [
      legacyAgentBalances,
      legacyCollections,
      legacyWalletFundings,
      legacyRefundAccruals,
      legacyRefundSettlements,
      legacyPrizeAccruals,
      legacyAgentPrizes,
      legacyRemittanceCommissions,
      legacyBankRemittances,
      legacyWalletCredits,
      legacyWalletSettlements,
      legacyPayoutHistory,
      legacyCommissionDisbursements,
      postCutoverPaystackFundings,
      liveCollectionsMissingLedger,
      creditedFundingsMissingLedger,
      openCriticalReconciliationIssues,
    ] =
      await Promise.all([
        this.prisma.agent.count({
          where: {
            walletBalanceNgn: {
              not:
                0,
            },
          },
        }),

        this.prisma.paymentTransaction.count({
          where: {
            createdAt: {
              lt:
                cutoverAt,
            },
            status: {
              in:
                MIGRATABLE_PAYMENT_STATUSES,
            },
            collectionLedgerTxnId:
              null,
          },
        }),

        this.prisma.walletFunding.count({
          where: {
            initiatedAt: {
              lt:
                cutoverAt,
            },
            status:
              WalletFundingStatus.CREDITED,
            ledgerTxnId:
              null,
          },
        }),

        this.prisma.paymentTransaction.count({
          where: {
            createdAt: {
              lt:
                cutoverAt,
            },
            refundStatus: {
              not:
                null,
            },
            refundAccrualLedgerTxnId:
              null,
          },
        }),

        this.prisma.paymentTransaction.count({
          where: {
            createdAt: {
              lt:
                cutoverAt,
            },
            refundStatus:
              PaymentRefundStatus.SUCCEEDED,
            refundSettlementLedgerTxnId:
              null,
          },
        }),

        this.prisma.prizeClaim.count({
          where: {
            createdAt: {
              lt:
                cutoverAt,
            },
            claimType:
              'CASH',
            status: {
              in: [
                PrizeClaimStatus.KYC_CLEARED,
                PrizeClaimStatus.CASH_PAID,
              ],
            },
            prizeAccrualLedgerTxnId:
              null,
          },
        }),

        this.prisma.prizeClaim.count({
          where: {
            createdAt: {
              lt:
                cutoverAt,
            },
            status:
              PrizeClaimStatus.CASH_PAID,
            paidByAgentId: {
              not:
                null,
            },
            agentPayoutLedgerTxnId:
              null,
          },
        }),

        this.prisma.remittance.count({
          where: {
            createdAt: {
              lt:
                cutoverAt,
            },
            commissionNgn: {
              gt:
                0,
            },
            commissionLedgerTxnId:
              null,
          },
        }),

        this.prisma.remittance.count({
          where: {
            createdAt: {
              lt:
                cutoverAt,
            },
            amountDueNgn: {
              gt:
                0,
            },
            status:
              RemittanceStatus.RECEIVED,
            settlementLedgerTxnId:
              null,
            NOT: {
              bankTransferRef: {
                startsWith:
                  'WALLET-',
              },
            },
          },
        }),

        this.prisma.remittance.count({
          where: {
            createdAt: {
              lt:
                cutoverAt,
            },
            amountDueNgn: {
              lt:
                0,
            },
            walletCreditLedgerTxnId:
              null,
          },
        }),

        this.prisma.remittance.count({
          where: {
            createdAt: {
              lt:
                cutoverAt,
            },
            amountDueNgn: {
              gt:
                0,
            },
            status:
              RemittanceStatus.RECEIVED,
            bankTransferRef: {
              startsWith:
                'WALLET-',
            },
            settlementLedgerTxnId:
              null,
          },
        }),

        this.prisma.prizeClaim.count({
          where: {
            createdAt: {
              lt:
                cutoverAt,
            },
            paidByAgentId:
              null,
            payoutStatus: {
              not:
                null,
            },
            payoutAttempts: {
              none:
                {},
            },
          },
        }),

        this.prisma.commissionDisbursement.count({
          where: {
            createdAt: {
              lt:
                cutoverAt,
            },
          },
        }),

        this.prisma.walletFunding.count({
          where: {
            createdAt: {
              gte:
                cutoverAt,
            },
            gateway:
              PaymentGateway.PAYSTACK,
          },
        }),

        this.prisma.paymentTransaction.count({
          where: {
            createdAt: {
              gte:
                cutoverAt,
            },
            status: {
              in:
                MIGRATABLE_PAYMENT_STATUSES,
            },
            collectionLedgerTxnId:
              null,
          },
        }),

        this.prisma.walletFunding.count({
          where: {
            initiatedAt: {
              gte:
                cutoverAt,
            },
            status:
              WalletFundingStatus.CREDITED,
            ledgerTxnId:
              null,
          },
        }),

        this.prisma.reconciliationIssue.count({
          where: {
            status:
              'OPEN',
            severity:
              'CRITICAL',
          },
        }),
      ]);

    return {
      legacyAgentBalances,
      legacyCollections,
      legacyWalletFundings,
      legacyRefundAccruals,
      legacyRefundSettlements,
      legacyPrizeAccruals,
      legacyAgentPrizes,
      legacyRemittanceCommissions,
      legacyBankRemittances,
      legacyWalletCredits,
      legacyWalletSettlements,
      legacyPayoutHistory,
      legacyCommissionDisbursements,
      postCutoverPaystackFundings,
      liveCollectionsMissingLedger,
      creditedFundingsMissingLedger,
      openCriticalReconciliationIssues,
    };
  }

  private requireRun(
    runId: string,
  ) {
    return this.prisma.financialMigrationRun.findUnique({
      where: {
        runId,
      },
    }).then(
      (
        run,
      ) => {
        if (!run) {
          throw new NotFoundException(
            'Financial migration run not found',
          );
        }

        return run;
      },
    );
  }

  private runView(
    run: {
      runId: string;
      label: string;
      status: FinancialMigrationRunStatus;
      createdBy: string | null;
      cutoverAt: Date;
      plannedCount: number;
      appliedCount: number;
      skippedCount: number;
      reviewCount: number;
      failedCount: number;
      startedAt: Date | null;
      completedAt: Date | null;
      finalizedAt: Date | null;
      notes: string | null;
      createdAt: Date;
    },
  ) {
    return {
      runId:
        run.runId,
      label:
        run.label,
      status:
        run.status,
      createdBy:
        run.createdBy,
      cutoverAt:
        run.cutoverAt.toISOString(),
      plannedCount:
        run.plannedCount,
      appliedCount:
        run.appliedCount,
      skippedCount:
        run.skippedCount,
      reviewCount:
        run.reviewCount,
      failedCount:
        run.failedCount,
      startedAt:
        run.startedAt?.toISOString() ??
        null,
      completedAt:
        run.completedAt?.toISOString() ??
        null,
      finalizedAt:
        run.finalizedAt?.toISOString() ??
        null,
      notes:
        run.notes,
      createdAt:
        run.createdAt.toISOString(),
    };
  }

  private json(
    value: unknown,
  ): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify(
        value,
        (
          _key,
          item,
        ) =>
          typeof item ===
          'bigint'
            ? item.toString()
            : item,
      ),
    ) as Prisma.InputJsonValue;
  }
}
