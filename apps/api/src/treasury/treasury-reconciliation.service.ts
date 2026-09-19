import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  AuditSeverity,
  PaymentGateway,
  PaymentStatus,
  Prisma,
  ReconciliationIssueStatus,
  ReconciliationIssueType,
  ReconciliationRunStatus,
  ReconciliationRunType,
  TreasuryProvider,
  WalletFundingStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

import {
  ExternalCollectionTransaction,
  TreasuryProviderService,
} from './treasury-provider.service';

const BALANCE_TOLERANCE_MINOR = 99n;

@Injectable()
export class TreasuryReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly providers: TreasuryProviderService,
  ) {}

  async overview() {
    const accounts =
      await this.prisma.treasuryAccount.findMany({
        orderBy: {
          code: 'asc',
        },
        include: {
          balanceSnapshots: {
            orderBy: {
              observedAt: 'desc',
            },
            take: 1,
          },
        },
      });

    const [
      openIssues,
      settlementCounts,
    ] =
      await Promise.all([
        this.prisma.reconciliationIssue.groupBy({
          by: [
            'severity',
          ],
          where: {
            status:
              ReconciliationIssueStatus.OPEN,
          },
          _count:
            true,
        }),

        this.prisma.treasurySettlement.groupBy({
          by: [
            'provider',
            'status',
          ],
          _count:
            true,
        }),
      ]);

    const accountViews =
      [];

    for (
      const account of
      accounts
    ) {
      const internal =
        await this.ledger.getAccountBalance(
          account.ledgerAccountId,
        );

      const latest =
        account.balanceSnapshots[0] ??
        null;

      accountViews.push({
        treasuryAccountId:
          account.treasuryAccountId,
        code:
          account.code,
        name:
          account.name,
        provider:
          account.provider,
        kind:
          account.kind,
        currency:
          account.currency,
        status:
          account.status,
        externalAccountReference:
          account.externalAccountReference,
        bankCode:
          account.bankCode,
        accountLast4:
          account.accountLast4,
        internalBalanceMinor:
          BigInt(
            internal.balanceNgn,
          )
            .mul
            ? '0'
            : (
                BigInt(
                  internal.balanceNgn,
                ) *
                100n
              ).toString(),
        latestExternalBalanceMinor:
          latest
            ?.externalBalanceMinor
            .toString() ??
          null,
        latestVarianceMinor:
          latest
            ?.varianceMinor
            .toString() ??
          null,
        latestObservedAt:
          latest
            ?.observedAt
            .toISOString() ??
          null,
      });
    }

    return {
      generatedAt:
        new Date().toISOString(),
      accounts:
        accountViews,
      openIssues:
        openIssues.map(
          (row) => ({
            severity:
              row.severity,
            count:
              row._count,
          }),
        ),
      settlements:
        settlementCounts.map(
          (row) => ({
            provider:
              row.provider,
            status:
              row.status,
            count:
              row._count,
          }),
        ),
    };
  }

  async reconcileTransactions(
    provider: TreasuryProvider,
    from: Date,
    to: Date,
  ) {
    this.assertCollectionProvider(
      provider,
    );

    if (
      to.getTime() <
      from.getTime()
    ) {
      throw new BadRequestException(
        'Reconciliation end must not be before start',
      );
    }

    const run =
      await this.prisma.reconciliationRun.create({
        data: {
          runType:
            ReconciliationRunType.TRANSACTION,
          provider,
          status:
            ReconciliationRunStatus.RUNNING,
          periodFrom:
            from,
          periodTo:
            to,
        },
      });

    try {
      const external =
        provider ===
        TreasuryProvider.MONNIFY
          ? await this.providers.monnifyTransactions(
              from,
              to,
            )
          : await this.providers.flutterwaveTransactions(
              from,
              to,
            );

      const externalReferences =
        new Set(
          external.map(
            (row) =>
              row.providerReference,
          ),
        );

      let matched =
        0;

      for (
        const row of
        external
      ) {
        const issueCount =
          await this.compareExternalTransaction(
            run.runId,
            provider,
            row,
          );

        if (
          issueCount ===
          0
        ) {
          matched +=
            1;
        }
      }

      const missingExternal =
        await this.findMissingExternal(
          run.runId,
          provider,
          from,
          to,
          externalReferences,
        );

      const issueCount =
        await this.prisma.reconciliationIssue.count({
          where: {
            runId:
              run.runId,
          },
        });

      const completed =
        await this.prisma.reconciliationRun.update({
          where: {
            runId:
              run.runId,
          },
          data: {
            status:
              issueCount >
              0
                ? ReconciliationRunStatus.COMPLETED_WITH_EXCEPTIONS
                : ReconciliationRunStatus.COMPLETED,
            recordsScanned:
              external.length +
              missingExternal.scanned,
            recordsMatched:
              matched +
              missingExternal.matched,
            issueCount,
            completedAt:
              new Date(),
          },
        });

      return this.runView(
        completed,
      );
    } catch (error) {
      await this.prisma.reconciliationRun.update({
        where: {
          runId:
            run.runId,
        },
        data: {
          status:
            ReconciliationRunStatus.FAILED,
          errorMessage:
            error instanceof
            Error
              ? error.message
              : 'Unknown reconciliation error',
          completedAt:
            new Date(),
        },
      });

      throw error;
    }
  }

  async snapshotProviderBalance(
    provider: TreasuryProvider,
  ) {
    if (
      provider !==
        TreasuryProvider.MONNIFY &&
      provider !==
        TreasuryProvider.FLUTTERWAVE
    ) {
      throw new BadRequestException(
        'Provider balance must be MONNIFY or FLUTTERWAVE',
      );
    }

    const code =
      provider ===
        TreasuryProvider.MONNIFY
        ? 'TRSY:MONNIFY:PAYOUT'
        : 'TRSY:FLUTTERWAVE:PAYOUT';

    const account =
      await this.prisma.treasuryAccount.findUniqueOrThrow({
        where: {
          code,
        },
      });

    const external =
      provider ===
        TreasuryProvider.MONNIFY
        ? await this.providers.monnifyPayoutBalance()
        : await this.providers.flutterwavePayoutBalance();

    return this.recordBalanceSnapshot(
      account.treasuryAccountId,
      provider,
      external.availableBalanceMinor,
      this.json(
        external.raw,
      ),
      null,
    );
  }

  async recordBankBalance(
    balanceNgn: number,
    externalReference: string | null,
    rawPayload?: Prisma.InputJsonValue,
  ) {
    if (
      !Number.isFinite(
        balanceNgn,
      ) ||
      balanceNgn <
        0
    ) {
      throw new BadRequestException(
        'Bank balance must be a non-negative NGN amount',
      );
    }

    const account =
      await this.prisma.treasuryAccount.findUniqueOrThrow({
        where: {
          code:
            'TRSY:BANK:PRIMARY',
        },
      });

    return this.recordBalanceSnapshot(
      account.treasuryAccountId,
      TreasuryProvider.BANK,
      BigInt(
        Math.round(
          balanceNgn *
          100,
        ),
      ),
      rawPayload ??
        this.json({
          balanceNgn,
        }),
      externalReference,
    );
  }

  async listRuns() {
    const rows =
      await this.prisma.reconciliationRun.findMany({
        orderBy: {
          startedAt:
            'desc',
        },
        take:
          100,
      });

    return {
      runs:
        rows.map(
          (row) =>
            this.runView(
              row,
            ),
        ),
    };
  }

  async listIssues(
    status:
      ReconciliationIssueStatus =
        ReconciliationIssueStatus.OPEN,
  ) {
    const rows =
      await this.prisma.reconciliationIssue.findMany({
        where: {
          status,
        },
        orderBy: [
          {
            severity:
              'desc',
          },
          {
            createdAt:
              'desc',
          },
        ],
        take:
          300,
        include: {
          run:
            true,
          treasuryAccount:
            true,
        },
      });

    return {
      issues:
        rows.map(
          (row) => ({
            issueId:
              row.issueId,
            runId:
              row.runId,
            runType:
              row.run.runType,
            provider:
              row.provider,
            accountCode:
              row.treasuryAccount
                ?.code ??
              null,
            type:
              row.type,
            status:
              row.status,
            severity:
              row.severity,
            internalReference:
              row.internalReference,
            externalReference:
              row.externalReference,
            expectedAmountMinor:
              row.expectedAmountMinor
                ?.toString() ??
              null,
            actualAmountMinor:
              row.actualAmountMinor
                ?.toString() ??
              null,
            varianceMinor:
              row.varianceMinor
                ?.toString() ??
              null,
            details:
              row.details,
            resolvedByAdminId:
              row.resolvedByAdminId,
            resolvedAt:
              row.resolvedAt
                ?.toISOString() ??
              null,
            resolutionNote:
              row.resolutionNote,
            createdAt:
              row.createdAt.toISOString(),
          }),
        ),
    };
  }

  async resolveIssue(
    issueId: string,
    adminId: string,
    status:
      | ReconciliationIssueStatus.RESOLVED
      | ReconciliationIssueStatus.IGNORED,
    note: string,
  ) {
    const issue =
      await this.prisma.reconciliationIssue.findUnique({
        where: {
          issueId,
        },
      });

    if (!issue) {
      throw new NotFoundException(
        'Reconciliation issue not found',
      );
    }

    if (
      issue.status !==
      ReconciliationIssueStatus.OPEN
    ) {
      return issue;
    }

    return this.prisma.reconciliationIssue.update({
      where: {
        issueId,
      },
      data: {
        status,
        resolvedByAdminId:
          adminId,
        resolvedAt:
          new Date(),
        resolutionNote:
          note.trim() ||
          null,
      },
    });
  }

  private async compareExternalTransaction(
    runId: string,
    provider: TreasuryProvider,
    external: ExternalCollectionTransaction,
  ) {
    const gateway =
      this.gateway(
        provider,
      );

    const [
      payment,
      funding,
    ] =
      await Promise.all([
        this.prisma.paymentTransaction.findUnique({
          where: {
            gatewayReference:
              external.providerReference,
          },
        }),
        this.prisma.walletFunding.findUnique({
          where: {
            gatewayReference:
              external.providerReference,
          },
        }),
      ]);

    if (
      !payment &&
      !funding
    ) {
      await this.issue({
        runId,
        provider,
        type:
          ReconciliationIssueType.MISSING_INTERNAL,
        severity:
          this.externalIsPaid(
            provider,
            external.status,
          )
            ? AuditSeverity.CRITICAL
            : AuditSeverity.WARNING,
        externalReference:
          external.providerReference,
        actualAmountMinor:
          external.amountMinor,
        details: {
          externalStatus:
            external.status,
          providerTransactionId:
            external.providerTransactionId,
        },
      });

      return 1;
    }

    if (
      payment &&
      funding
    ) {
      await this.issue({
        runId,
        provider,
        type:
          ReconciliationIssueType.UNMAPPED_REFERENCE,
        severity:
          AuditSeverity.CRITICAL,
        internalReference:
          external.providerReference,
        externalReference:
          external.providerReference,
        details: {
          reason:
            'Reference maps to both PaymentTransaction and WalletFunding',
        },
      });

      return 1;
    }

    const internal =
      payment
        ? {
            kind:
              'PAYMENT' as const,
            id:
              payment.txnId,
            gateway:
              payment.gateway,
            amountNgn:
              payment.amountNgn,
            recognized:
              Boolean(
                payment.collectionLedgerTxnId,
              ),
            successful:
              [
                PaymentStatus.CONFIRMED,
                PaymentStatus.REVIEW_REQUIRED,
                PaymentStatus.REFUND_PENDING,
                PaymentStatus.REFUNDED,
              ].includes(
                payment.status,
              ),
            status:
              payment.status,
            providerTransactionId:
              payment.providerTransactionId,
          }
        : {
            kind:
              'WALLET_FUNDING' as const,
            id:
              funding!.fundingId,
            gateway:
              funding!.gateway,
            amountNgn:
              funding!.amountNgn,
            recognized:
              Boolean(
                funding!.ledgerTxnId,
              ),
            successful:
              [
                WalletFundingStatus.CREDITED,
                WalletFundingStatus.REVIEW_REQUIRED,
              ].includes(
                funding!.status,
              ),
            status:
              funding!.status,
            providerTransactionId:
              funding!.providerTransactionId,
          };

    let issues =
      0;

    const expectedMinor =
      BigInt(
        internal.amountNgn,
      ) *
      100n;

    if (
      internal.gateway !==
      gateway
    ) {
      issues +=
        1;

      await this.issue({
        runId,
        provider,
        type:
          ReconciliationIssueType.STATUS_MISMATCH,
        severity:
          AuditSeverity.CRITICAL,
        internalReference:
          external.providerReference,
        externalReference:
          external.providerReference,
        details: {
          reason:
            'Internal gateway does not match external provider',
          internalGateway:
            internal.gateway,
        },
      });
    }

    if (
      expectedMinor !==
      external.amountMinor
    ) {
      issues +=
        1;

      await this.issue({
        runId,
        provider,
        type:
          ReconciliationIssueType.AMOUNT_MISMATCH,
        severity:
          AuditSeverity.CRITICAL,
        internalReference:
          external.providerReference,
        externalReference:
          external.providerReference,
        expectedAmountMinor:
          expectedMinor,
        actualAmountMinor:
          external.amountMinor,
        varianceMinor:
          external.amountMinor -
          expectedMinor,
        details: {
          internalKind:
            internal.kind,
          internalId:
            internal.id,
        },
      });
    }

    if (
      external.currency &&
      external.currency !==
        'NGN'
    ) {
      issues +=
        1;

      await this.issue({
        runId,
        provider,
        type:
          ReconciliationIssueType.CURRENCY_MISMATCH,
        severity:
          AuditSeverity.CRITICAL,
        internalReference:
          external.providerReference,
        externalReference:
          external.providerReference,
        details: {
          expected:
            'NGN',
          actual:
            external.currency,
        },
      });
    }

    const externalPaid =
      this.externalIsPaid(
        provider,
        external.status,
      );

    if (
      externalPaid !==
      internal.successful
    ) {
      issues +=
        1;

      await this.issue({
        runId,
        provider,
        type:
          ReconciliationIssueType.STATUS_MISMATCH,
        severity:
          externalPaid
            ? AuditSeverity.CRITICAL
            : AuditSeverity.WARNING,
        internalReference:
          external.providerReference,
        externalReference:
          external.providerReference,
        details: {
          internalStatus:
            String(
              internal.status,
            ),
          externalStatus:
            external.status,
        },
      });
    }

    if (
      externalPaid &&
      !internal.recognized
    ) {
      issues +=
        1;

      await this.issue({
        runId,
        provider,
        type:
          ReconciliationIssueType.MISSING_INTERNAL,
        severity:
          AuditSeverity.CRITICAL,
        internalReference:
          external.providerReference,
        externalReference:
          external.providerReference,
        expectedAmountMinor:
          external.amountMinor,
        details: {
          reason:
            'Provider has received money but no internal collection journal exists',
          internalKind:
            internal.kind,
          internalId:
            internal.id,
        },
      });
    }

    if (
      external.providerTransactionId &&
      internal.providerTransactionId &&
      external.providerTransactionId !==
        internal.providerTransactionId
    ) {
      issues +=
        1;

      await this.issue({
        runId,
        provider,
        type:
          ReconciliationIssueType.STATUS_MISMATCH,
        severity:
          AuditSeverity.WARNING,
        internalReference:
          external.providerReference,
        externalReference:
          external.providerReference,
        details: {
          reason:
            'Provider transaction ID differs',
          internalProviderTransactionId:
            internal.providerTransactionId,
          externalProviderTransactionId:
            external.providerTransactionId,
        },
      });
    }

    return issues;
  }

  private async findMissingExternal(
    runId: string,
    provider: TreasuryProvider,
    from: Date,
    to: Date,
    externalReferences: Set<string>,
  ) {
    const gateway =
      this.gateway(
        provider,
      );

    const [
      payments,
      fundings,
    ] =
      await Promise.all([
        this.prisma.paymentTransaction.findMany({
          where: {
            gateway,
            createdAt: {
              gte:
                from,
              lte:
                to,
            },
            status: {
              in: [
                PaymentStatus.CONFIRMED,
                PaymentStatus.REVIEW_REQUIRED,
                PaymentStatus.REFUND_PENDING,
                PaymentStatus.REFUNDED,
                PaymentStatus.FAILED,
              ],
            },
          },
          select: {
            txnId:
              true,
            gatewayReference:
              true,
            amountNgn:
              true,
            status:
              true,
          },
        }),
        this.prisma.walletFunding.findMany({
          where: {
            gateway,
            initiatedAt: {
              gte:
                from,
              lte:
                to,
            },
            status: {
              in: [
                WalletFundingStatus.CREDITED,
                WalletFundingStatus.REVIEW_REQUIRED,
                WalletFundingStatus.FAILED,
              ],
            },
          },
          select: {
            fundingId:
              true,
            gatewayReference:
              true,
            amountNgn:
              true,
            status:
              true,
          },
        }),
      ]);

    let missing =
      0;

    for (
      const payment of
      payments
    ) {
      if (
        externalReferences.has(
          payment.gatewayReference,
        )
      ) {
        continue;
      }

      missing +=
        1;

      await this.issue({
        runId,
        provider,
        type:
          ReconciliationIssueType.MISSING_EXTERNAL,
        severity:
          payment.status ===
          PaymentStatus.FAILED
            ? AuditSeverity.WARNING
            : AuditSeverity.CRITICAL,
        internalReference:
          payment.gatewayReference,
        expectedAmountMinor:
          BigInt(
            payment.amountNgn,
          ) *
          100n,
        details: {
          internalKind:
            'PAYMENT',
          internalId:
            payment.txnId,
          internalStatus:
            payment.status,
        },
      });
    }

    for (
      const funding of
      fundings
    ) {
      if (
        externalReferences.has(
          funding.gatewayReference,
        )
      ) {
        continue;
      }

      missing +=
        1;

      await this.issue({
        runId,
        provider,
        type:
          ReconciliationIssueType.MISSING_EXTERNAL,
        severity:
          funding.status ===
          WalletFundingStatus.FAILED
            ? AuditSeverity.WARNING
            : AuditSeverity.CRITICAL,
        internalReference:
          funding.gatewayReference,
        expectedAmountMinor:
          BigInt(
            funding.amountNgn,
          ) *
          100n,
        details: {
          internalKind:
            'WALLET_FUNDING',
          internalId:
            funding.fundingId,
          internalStatus:
            funding.status,
        },
      });
    }

    return {
      scanned:
        payments.length +
        fundings.length,
      matched:
        payments.length +
        fundings.length -
        missing,
    };
  }

  private async recordBalanceSnapshot(
    treasuryAccountId: string,
    provider: TreasuryProvider,
    externalBalanceMinor: bigint,
    rawPayload: Prisma.InputJsonValue,
    externalReference: string | null,
  ) {
    const account =
      await this.prisma.treasuryAccount.findUniqueOrThrow({
        where: {
          treasuryAccountId,
        },
      });

    const internal =
      await this.ledger.getAccountBalance(
        account.ledgerAccountId,
      );

    const internalMinor =
      BigInt(
        internal.balanceNgn,
      ) *
      100n;

    const variance =
      externalBalanceMinor -
      internalMinor;

    const now =
      new Date();

    const run =
      await this.prisma.$transaction(
        async (tx) => {
          const created =
            await tx.reconciliationRun.create({
              data: {
                runType:
                  ReconciliationRunType.BALANCE,
                provider,
                treasuryAccountId,
                status:
                  this.abs(
                    variance,
                  ) >
                  BALANCE_TOLERANCE_MINOR
                    ? ReconciliationRunStatus.COMPLETED_WITH_EXCEPTIONS
                    : ReconciliationRunStatus.COMPLETED,
                periodFrom:
                  now,
                periodTo:
                  now,
                recordsScanned:
                  1,
                recordsMatched:
                  this.abs(
                    variance,
                  ) <=
                  BALANCE_TOLERANCE_MINOR
                    ? 1
                    : 0,
                issueCount:
                  this.abs(
                    variance,
                  ) >
                  BALANCE_TOLERANCE_MINOR
                    ? 1
                    : 0,
                varianceMinor:
                  variance,
                completedAt:
                  now,
              },
            });

          await tx.treasuryBalanceSnapshot.create({
            data: {
              treasuryAccountId,
              externalBalanceMinor,
              internalBalanceMinor:
                internalMinor,
              varianceMinor:
                variance,
              observedAt:
                now,
              externalReference,
              rawPayload,
            },
          });

          if (
            this.abs(
              variance,
            ) >
            BALANCE_TOLERANCE_MINOR
          ) {
            await tx.reconciliationIssue.create({
              data: {
                runId:
                  created.runId,
                treasuryAccountId,
                type:
                  ReconciliationIssueType.BALANCE_VARIANCE,
                severity:
                  AuditSeverity.CRITICAL,
                provider,
                expectedAmountMinor:
                  internalMinor,
                actualAmountMinor:
                  externalBalanceMinor,
                varianceMinor:
                  variance,
                details:
                  this.json({
                    accountCode:
                      account.code,
                    toleranceMinor:
                      BALANCE_TOLERANCE_MINOR.toString(),
                  }),
              },
            });
          }

          return created;
        },
      );

    return {
      run:
        this.runView(
          run,
        ),
      treasuryAccountId,
      accountCode:
        account.code,
      internalBalanceMinor:
        internalMinor.toString(),
      externalBalanceMinor:
        externalBalanceMinor.toString(),
      varianceMinor:
        variance.toString(),
      observedAt:
        now.toISOString(),
    };
  }

  private async issue(
    input: {
      runId: string;
      provider: TreasuryProvider;
      type: ReconciliationIssueType;
      severity: AuditSeverity;
      internalReference?: string | null;
      externalReference?: string | null;
      expectedAmountMinor?: bigint | null;
      actualAmountMinor?: bigint | null;
      varianceMinor?: bigint | null;
      details?: Record<string, unknown>;
    },
  ) {
    await this.prisma.reconciliationIssue.create({
      data: {
        runId:
          input.runId,
        provider:
          input.provider,
        type:
          input.type,
        severity:
          input.severity,
        internalReference:
          input.internalReference ??
          null,
        externalReference:
          input.externalReference ??
          null,
        expectedAmountMinor:
          input.expectedAmountMinor ??
          null,
        actualAmountMinor:
          input.actualAmountMinor ??
          null,
        varianceMinor:
          input.varianceMinor ??
          null,
        details:
          this.json(
            input.details ??
            {},
          ),
      },
    });
  }

  private gateway(
    provider: TreasuryProvider,
  ) {
    switch (
      provider
    ) {
      case TreasuryProvider.MONNIFY:
        return PaymentGateway.MONNIFY;

      case TreasuryProvider.FLUTTERWAVE:
        return PaymentGateway.FLUTTERWAVE;

      default:
        throw new BadRequestException(
          'Treasury provider is not a collection gateway',
        );
    }
  }

  private assertCollectionProvider(
    provider: TreasuryProvider,
  ) {
    this.gateway(
      provider,
    );
  }

  private externalIsPaid(
    provider: TreasuryProvider,
    status: string,
  ) {
    const normalized =
      status
        .trim()
        .toUpperCase();

    return provider ===
      TreasuryProvider.MONNIFY
      ? normalized ===
          'PAID'
      : normalized ===
          'SUCCESSFUL' ||
          normalized ===
          'SUCCESS';
  }

  private runView(
    run: {
      runId: string;
      runType: ReconciliationRunType;
      provider: TreasuryProvider | null;
      treasuryAccountId: string | null;
      status: ReconciliationRunStatus;
      periodFrom: Date;
      periodTo: Date;
      recordsScanned: number;
      recordsMatched: number;
      issueCount: number;
      varianceMinor: bigint;
      errorMessage: string | null;
      startedAt: Date;
      completedAt: Date | null;
    },
  ) {
    return {
      runId:
        run.runId,
      runType:
        run.runType,
      provider:
        run.provider,
      treasuryAccountId:
        run.treasuryAccountId,
      status:
        run.status,
      periodFrom:
        run.periodFrom.toISOString(),
      periodTo:
        run.periodTo.toISOString(),
      recordsScanned:
        run.recordsScanned,
      recordsMatched:
        run.recordsMatched,
      issueCount:
        run.issueCount,
      varianceMinor:
        run.varianceMinor.toString(),
      errorMessage:
        run.errorMessage,
      startedAt:
        run.startedAt.toISOString(),
      completedAt:
        run.completedAt
          ?.toISOString() ??
        null,
    };
  }

  private abs(
    value: bigint,
  ) {
    return value <
      0n
      ? -value
      : value;
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
