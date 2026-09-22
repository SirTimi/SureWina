import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AgentStatus,
  AuditSeverity,
  FinancialMigrationRunStatus,
  LedgerAccountType,
  LedgerAccountPurpose,
  LedgerEntrySide,
  LedgerOwnerType,
  LedgerTransactionKind,
  PaymentGateway,
  PaymentStatus,
  PrizeClaimStatus,
  PrizePayoutStatus,
  ReconciliationIssueStatus,
  RemittanceStatus,
  TreasuryAccountStatus,
  WalletFundingStatus,
  WalletHoldStatus,
  WalletPurchaseStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import {
  SYSTEM_LEDGER_ACCOUNTS,
  SYSTEM_LEDGER_ACCOUNT_CODES,
} from '../ledger/ledger.constants';

type CheckStatus =
  | 'PASS'
  | 'REVIEW'
  | 'BLOCKER';

type CheckResult = {
  id: string;
  label: string;
  status: CheckStatus;
  summary: string;
  details?: unknown;
};

type RolloutOptions = {
  production: boolean;
  strictReview: boolean;
};

type LedgerMismatchRow = {
  ledgerTxnId: string;
  kind: string;
  totalAmountNgn: number;
  entryCount: number;
  actualEntryCount: bigint;
  debitNgn: bigint;
  creditNgn: bigint;
};

type BalanceRow = {
  accountId: string;
  side: LedgerEntrySide;
  _sum: {
    amountNgn: number | null;
  };
};

@Injectable()
export class RolloutCheckService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(ConfigService)
    private readonly config: ConfigService,
  ) {}

  async run(options: RolloutOptions) {
    const checks: CheckResult[] = [];

    checks.push(
      await this.checkSystemLedgerAccounts(),
      await this.checkLedgerBalance(),
      await this.checkWalletStructure(),
      await this.checkWalletBalances(),
      await this.checkLocalSmokeArtifacts(options.production),
      await this.checkPaymentCollections(),
      await this.checkWalletFunding(),
      await this.checkWalletPurchases(),
      await this.checkAgentSales(),
      await this.checkAgentPrizeReimbursements(),
      await this.checkBankPrizePayouts(),
      await this.checkRetiredDebtSuspensions(),
      await this.checkReconciliation(),
      await this.checkSuspenseBalance(options.production),
      await this.checkTreasury(options.production),
      await this.checkMigration(options.production),
      await this.checkHistoricalRemittance(),
    );

    if (options.production) {
      checks.push(
        this.checkProductionConfiguration(),
      );
    }

    const blockers =
      checks.filter(
        (check) =>
          check.status ===
          'BLOCKER',
      ).length;

    const reviews =
      checks.filter(
        (check) =>
          check.status ===
          'REVIEW',
      ).length;

    const passed =
      checks.filter(
        (check) =>
          check.status ===
          'PASS',
      ).length;

    return {
      generatedAt:
        new Date().toISOString(),
      mode:
        options.production
          ? 'production'
          : 'prelive',
      strictReview:
        options.strictReview,
      ready:
        blockers === 0 &&
        (!options.strictReview ||
          reviews === 0),
      summary: {
        blockers,
        reviews,
        passed,
      },
      checks,
    };
  }

  private async checkSystemLedgerAccounts(): Promise<CheckResult> {
    const expectedCodes =
      SYSTEM_LEDGER_ACCOUNTS.map(
        (account) =>
          account.code,
      );

    const rows =
      await this.prisma.ledgerAccount.findMany({
        where: {
          code: {
            in: expectedCodes,
          },
        },
      });

    const byCode =
      new Map(
        rows.map(
          (row) => [
            row.code,
            row,
          ],
        ),
      );

    const problems: string[] =
      [];

    for (
      const expected
      of SYSTEM_LEDGER_ACCOUNTS
    ) {
      const actual =
        byCode.get(
          expected.code,
        );

      if (!actual) {
        problems.push(
          `${expected.code}: missing`,
        );
        continue;
      }

      if (
        actual.accountType !==
          expected.accountType ||
        actual.purpose !==
          expected.purpose ||
        actual.ownerType !==
          expected.ownerType ||
        actual.ownerId !==
          null ||
        actual.currency !==
          'NGN'
      ) {
        problems.push(
          `${expected.code}: identity mismatch`,
        );
      }
    }

    return problems.length ===
      0
      ? this.pass(
          'ledger.system-accounts',
          'System ledger accounts',
          `All ${expectedCodes.length} required system accounts are present with the expected identity.`,
        )
      : this.blocker(
          'ledger.system-accounts',
          'System ledger accounts',
          `${problems.length} required system ledger account issue(s) found.`,
          problems,
        );
  }

  private async checkLedgerBalance(): Promise<CheckResult> {
    const rows =
      await this.prisma.$queryRaw<
        LedgerMismatchRow[]
      >`
        SELECT
          lt."ledger_txn_id" AS "ledgerTxnId",
          lt."kind"::text AS "kind",
          lt."total_amount_ngn" AS "totalAmountNgn",
          lt."entry_count" AS "entryCount",
          COUNT(le."entry_id")::bigint AS "actualEntryCount",
          COALESCE(
            SUM(
              CASE
                WHEN le."side"::text = 'DEBIT'
                THEN le."amount_ngn"
                ELSE 0
              END
            ),
            0
          )::bigint AS "debitNgn",
          COALESCE(
            SUM(
              CASE
                WHEN le."side"::text = 'CREDIT'
                THEN le."amount_ngn"
                ELSE 0
              END
            ),
            0
          )::bigint AS "creditNgn"
        FROM "ledger_transactions" lt
        LEFT JOIN "ledger_entries" le
          ON le."ledger_txn_id" = lt."ledger_txn_id"
        GROUP BY
          lt."ledger_txn_id",
          lt."kind",
          lt."total_amount_ngn",
          lt."entry_count"
        HAVING
          COUNT(le."entry_id") <> lt."entry_count"
          OR COUNT(le."entry_id") < 2
          OR COALESCE(
            SUM(
              CASE
                WHEN le."side"::text = 'DEBIT'
                THEN le."amount_ngn"
                ELSE 0
              END
            ),
            0
          ) <> COALESCE(
            SUM(
              CASE
                WHEN le."side"::text = 'CREDIT'
                THEN le."amount_ngn"
                ELSE 0
              END
            ),
            0
          )
          OR COALESCE(
            SUM(
              CASE
                WHEN le."side"::text = 'DEBIT'
                THEN le."amount_ngn"
                ELSE 0
              END
            ),
            0
          ) <> lt."total_amount_ngn"
        LIMIT 100
      `;

    if (
      rows.length ===
      0
    ) {
      const total =
        await this.prisma.ledgerTransaction.count();

      return this.pass(
        'ledger.balance',
        'Double-entry ledger balance',
        `${total} ledger transaction(s) are balanced and internally consistent.`,
      );
    }

    return this.blocker(
      'ledger.balance',
      'Double-entry ledger balance',
      `${rows.length} ledger transaction mismatch(es) found (showing up to 100).`,
      rows.map(
        (row) => ({
          ...row,
          actualEntryCount:
            Number(
              row.actualEntryCount,
            ),
          debitNgn:
            Number(
              row.debitNgn,
            ),
          creditNgn:
            Number(
              row.creditNgn,
            ),
        }),
      ),
    );
  }

  private async checkWalletStructure(): Promise<CheckResult> {
    const wallets =
      await this.prisma.wallet.findMany({
        include: {
          availableAccount:
            true,
          heldAccount:
            true,
        },
      });

    const problems: Array<{
      walletId: string;
      reason: string;
    }> = [];

    for (
      const wallet
      of wallets
    ) {
      const ownerId =
        wallet.userId ??
        wallet.agentId;

      if (
        wallet.availableAccountId ===
        wallet.heldAccountId
      ) {
        problems.push({
          walletId:
            wallet.walletId,
          reason:
            'available and held accounts are the same',
        });
      }

      if (
        wallet.ownerType ===
        LedgerOwnerType.CUSTOMER
      ) {
        if (
          !wallet.userId ||
          wallet.agentId
        ) {
          problems.push({
            walletId:
              wallet.walletId,
            reason:
              'customer wallet owner fields are invalid',
          });
        }

        if (
          wallet.availableAccount.purpose !==
            LedgerAccountPurpose.CUSTOMER_AVAILABLE ||
          wallet.heldAccount.purpose !==
            LedgerAccountPurpose.CUSTOMER_HELD
        ) {
          problems.push({
            walletId:
              wallet.walletId,
            reason:
              'customer wallet account purposes are invalid',
          });
        }
      } else if (
        wallet.ownerType ===
        LedgerOwnerType.AGENT
      ) {
        if (
          !wallet.agentId ||
          wallet.userId
        ) {
          problems.push({
            walletId:
              wallet.walletId,
            reason:
              'agent wallet owner fields are invalid',
          });
        }

        if (
          wallet.availableAccount.purpose !==
            LedgerAccountPurpose.AGENT_AVAILABLE ||
          wallet.heldAccount.purpose !==
            LedgerAccountPurpose.AGENT_HELD
        ) {
          problems.push({
            walletId:
              wallet.walletId,
            reason:
              'agent wallet account purposes are invalid',
          });
        }
      } else {
        problems.push({
          walletId:
            wallet.walletId,
          reason:
            'wallet owner type must be CUSTOMER or AGENT',
        });
      }

      for (
        const account
        of [
          wallet.availableAccount,
          wallet.heldAccount,
        ]
      ) {
        if (
          account.ownerType !==
            wallet.ownerType ||
          account.ownerId !==
            ownerId ||
          account.currency !==
            wallet.currency
        ) {
          problems.push({
            walletId:
              wallet.walletId,
            reason:
              `ledger account ${account.code} owner/currency does not match wallet`,
          });
        }
      }
    }

    return problems.length ===
      0
      ? this.pass(
          'wallet.structure',
          'Wallet/account structure',
          `${wallets.length} wallet(s) have consistent owner and ledger-account wiring.`,
        )
      : this.blocker(
          'wallet.structure',
          'Wallet/account structure',
          `${problems.length} wallet structure issue(s) found.`,
          problems.slice(
            0,
            100,
          ),
        );
  }

  private async checkWalletBalances(): Promise<CheckResult> {
    const wallets =
      await this.prisma.wallet.findMany({
        select: {
          walletId: true,
          ownerType: true,
          userId: true,
          agentId: true,
          availableAccountId:
            true,
          heldAccountId:
            true,
        },
      });

    const accountIds =
      wallets.flatMap(
        (wallet) => [
          wallet.availableAccountId,
          wallet.heldAccountId,
        ],
      );

    const grouped =
      accountIds.length ===
        0
        ? []
        : await this.prisma.ledgerEntry.groupBy({
            by: [
              'accountId',
              'side',
            ],
            where: {
              accountId: {
                in: accountIds,
              },
            },
            _sum: {
              amountNgn:
                true,
            },
          });

    const balances =
      this.liabilityBalances(
        grouped,
      );

    const negatives =
      wallets
        .map(
          (wallet) => ({
            walletId:
              wallet.walletId,
            ownerType:
              wallet.ownerType,
            ownerId:
              wallet.userId ??
              wallet.agentId,
            availableNgn:
              balances.get(
                wallet.availableAccountId,
              ) ??
              0,
            heldNgn:
              balances.get(
                wallet.heldAccountId,
              ) ??
              0,
          }),
        )
        .filter(
          (wallet) =>
            wallet.availableNgn <
              0 ||
            wallet.heldNgn <
              0,
        );

    return negatives.length ===
      0
      ? this.pass(
          'wallet.balances',
          'Wallet balance safety',
          `${wallets.length} wallet(s) have non-negative available and held balances.`,
        )
      : this.blocker(
          'wallet.balances',
          'Wallet balance safety',
          `${negatives.length} wallet(s) have a negative ledger-derived balance.`,
          negatives.slice(
            0,
            100,
          ),
        );
  }

  private async checkLocalSmokeArtifacts(production: boolean): Promise<CheckResult> {
    const [accounts, journals] =
      await Promise.all([
        this.prisma.ledgerAccount.count({
          where: {
            code: {
              startsWith:
                'TEST:ROLLOUT:',
            },
          },
        }),
        this.prisma.ledgerTransaction.count({
          where: {
            referenceType:
              'RolloutSmokeSeed',
          },
        }),
      ]);

    if (
      accounts === 0 &&
      journals === 0
    ) {
      return this.pass(
        'rollout.smoke-artifacts',
        'Local rollout smoke artifacts',
        'No local rollout smoke ledger artifacts are present.',
      );
    }

    if (production) {
      return this.blocker(
        'rollout.smoke-artifacts',
        'Local rollout smoke artifacts',
        `Production database contains local smoke artifacts: accounts=${accounts}, journals=${journals}.`,
        {
          accounts,
          journals,
        },
      );
    }

    return this.pass(
      'rollout.smoke-artifacts',
      'Local rollout smoke artifacts',
      `Local smoke-test artifacts are present as expected for controlled pre-live testing: accounts=${accounts}, journals=${journals}.`,
      {
        accounts,
        journals,
      },
    );
  }

  private async checkPaymentCollections(): Promise<CheckResult> {
    const rows =
      await this.prisma.paymentTransaction.findMany({
        where: {
          status: {
            in: [
              PaymentStatus.CONFIRMED,
              PaymentStatus.REVIEW_REQUIRED,
              PaymentStatus.REFUND_PENDING,
              PaymentStatus.REFUNDED,
            ],
          },
        },
        select: {
          txnId: true,
          gateway: true,
          status: true,
          ticketCount: true,
          collectionLedgerTxnId:
            true,
          _count: {
            select: {
              tickets:
                true,
            },
          },
        },
      });

    const problems =
      rows
        .filter(
          (row) =>
            !row.collectionLedgerTxnId ||
            (
              row.status !==
                PaymentStatus.REVIEW_REQUIRED &&
              row._count.tickets !==
                row.ticketCount
            ),
        )
        .map(
          (row) => ({
            txnId:
              row.txnId,
            gateway:
              row.gateway,
            status:
              row.status,
            ticketCount:
              row.ticketCount,
            actualTickets:
              row._count.tickets,
            collectionLedgerTxnId:
              row.collectionLedgerTxnId,
          }),
        );

    return problems.length ===
      0
      ? this.pass(
          'payments.collections',
          'Payment collection accounting',
          `${rows.length} material payment transaction(s) have collection ledger linkage and expected ticket counts.`,
        )
      : this.blocker(
          'payments.collections',
          'Payment collection accounting',
          `${problems.length} payment collection issue(s) found.`,
          problems.slice(
            0,
            100,
          ),
        );
  }

  private async checkWalletFunding(): Promise<CheckResult> {
    const credited =
      await this.prisma.walletFunding.findMany({
        where: {
          status:
            WalletFundingStatus.CREDITED,
        },
        include: {
          wallet: {
            select: {
              availableAccountId:
                true,
            },
          },
          ledgerTransaction: {
            include: {
              entries: {
                include: {
                  account:
                    true,
                },
              },
            },
          },
        },
      });

    const problems: Array<{
      fundingId: string;
      reason: string;
    }> = [];

    for (
      const funding
      of credited
    ) {
      const journal =
        funding.ledgerTransaction;

      if (
        !journal ||
        !funding.ledgerTxnId ||
        !funding.creditedAt
      ) {
        problems.push({
          fundingId:
            funding.fundingId,
          reason:
            'credited funding is missing ledger linkage or creditedAt',
        });
        continue;
      }

      const walletCredit =
        journal.entries
          .filter(
            (entry) =>
              entry.accountId ===
                funding.wallet
                  .availableAccountId &&
              entry.side ===
                LedgerEntrySide.CREDIT,
          )
          .reduce(
            (
              sum,
              entry,
            ) =>
              sum +
              entry.amountNgn,
            0,
          );

      const clearingDebit =
        journal.entries
          .filter(
            (entry) =>
              entry.account
                .purpose ===
                LedgerAccountPurpose.PSP_CLEARING &&
              entry.side ===
                LedgerEntrySide.DEBIT,
          )
          .reduce(
            (
              sum,
              entry,
            ) =>
              sum +
              entry.amountNgn,
            0,
          );

      if (
        journal.kind !==
          LedgerTransactionKind.FUNDING ||
        journal.referenceType !==
          'WalletFunding' ||
        journal.referenceId !==
          funding.fundingId ||
        walletCredit !==
          funding.amountNgn ||
        clearingDebit !==
          funding.amountNgn
      ) {
        problems.push({
          fundingId:
            funding.fundingId,
          reason:
            'funding journal does not match wallet credit / clearing debit',
        });
      }
    }

    if (
      problems.length >
      0
    ) {
      return this.blocker(
        'wallet.funding',
        'Wallet funding integrity',
        `${problems.length} credited funding journal issue(s) found.`,
        problems.slice(
          0,
          100,
        ),
      );
    }

    const reviewCount =
      await this.prisma.walletFunding.count({
        where: {
          status:
            WalletFundingStatus.REVIEW_REQUIRED,
        },
      });

    const staleThreshold =
      new Date(
        Date.now() -
          30 *
            60 *
            1000,
      );

    const staleCount =
      await this.prisma.walletFunding.count({
        where: {
          status: {
            in: [
              WalletFundingStatus.PENDING,
              WalletFundingStatus.PROCESSING,
            ],
          },
          initiatedAt: {
            lt:
              staleThreshold,
          },
        },
      });

    if (
      reviewCount >
        0 ||
      staleCount >
        0
    ) {
      return this.review(
        'wallet.funding',
        'Wallet funding integrity',
        `${credited.length} credited funding(s) are ledger-consistent; ${reviewCount} require Finance review and ${staleCount} pending/processing funding(s) are older than 30 minutes.`,
        {
          reviewRequired:
            reviewCount,
          stalePendingOrProcessing:
            staleCount,
        },
      );
    }

    return this.pass(
      'wallet.funding',
      'Wallet funding integrity',
      `${credited.length} credited funding(s) are ledger-consistent and no funding is awaiting review.`,
    );
  }

  private async checkWalletPurchases(): Promise<CheckResult> {
    const completed =
      await this.prisma.walletPurchase.findMany({
        where: {
          status:
            WalletPurchaseStatus.COMPLETED,
        },
        include: {
          hold:
            true,
          _count: {
            select: {
              tickets:
                true,
            },
          },
        },
      });

    const problems =
      completed
        .filter(
          (purchase) =>
            !purchase.holdId ||
            !purchase.completedAt ||
            !purchase.hold ||
            purchase.hold.status !==
              WalletHoldStatus.CAPTURED ||
            !purchase.hold
              .captureLedgerTxnId ||
            purchase.hold.amountNgn !==
              purchase.amountNgn ||
            purchase._count.tickets !==
              purchase.ticketCount,
        )
        .map(
          (purchase) => ({
            purchaseId:
              purchase.purchaseId,
            amountNgn:
              purchase.amountNgn,
            ticketCount:
              purchase.ticketCount,
            actualTickets:
              purchase._count.tickets,
            holdId:
              purchase.holdId,
            holdStatus:
              purchase.hold?.status ??
              null,
            captureLedgerTxnId:
              purchase.hold
                ?.captureLedgerTxnId ??
              null,
          }),
        );

    const pending =
      await this.prisma.walletPurchase.count({
        where: {
          status:
            WalletPurchaseStatus.PENDING,
        },
      });

    const purchaseHolds =
      await this.prisma.walletHold.count({
        where: {
          referenceType:
            'WalletPurchase',
          status:
            WalletHoldStatus.HELD,
        },
      });

    if (
      problems.length >
        0 ||
      pending >
        0 ||
      purchaseHolds >
        0
    ) {
      return this.blocker(
        'wallet.purchases',
        'Wallet ticket purchase integrity',
        `completedIssues=${problems.length}, persistedPendingPurchases=${pending}, unresolvedPurchaseHolds=${purchaseHolds}.`,
        {
          completedIssues:
            problems.slice(
              0,
              100,
            ),
          persistedPendingPurchases:
            pending,
          unresolvedPurchaseHolds:
            purchaseHolds,
        },
      );
    }

    return this.pass(
      'wallet.purchases',
      'Wallet ticket purchase integrity',
      `${completed.length} completed wallet purchase(s) have captured holds and matching ticket counts.`,
    );
  }

  private async checkAgentSales(): Promise<CheckResult> {
    const sales =
      await this.prisma.paymentTransaction.findMany({
        where: {
          gateway:
            PaymentGateway.AGENT_CASH,
          status:
            PaymentStatus.CONFIRMED,
        },
        select: {
          txnId: true,
          agentId: true,
          amountNgn: true,
          collectionLedgerTxn: {
            select: {
              ledgerTxnId:
                true,
              kind:
                true,
              entries: {
                select: {
                  side:
                    true,
                  amountNgn:
                    true,
                  account: {
                    select: {
                      purpose:
                        true,
                      ownerId:
                        true,
                    },
                  },
                },
              },
            },
          },
        },
      });

    const ids =
      sales.map(
        (sale) =>
          sale.txnId,
      );

    const commissions =
      ids.length ===
        0
        ? []
        : await this.prisma.ledgerTransaction.findMany({
            where: {
              kind:
                LedgerTransactionKind.COMMISSION,
              referenceType:
                'PaymentTransaction',
              referenceId: {
                in: ids,
              },
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

    const commissionByTxn =
      new Map<
        string,
        number
      >();

    for (
      const journal
      of commissions
    ) {
      const amount =
        journal.entries
          .filter(
            (entry) =>
              entry.account
                .purpose ===
                LedgerAccountPurpose.AGENT_COMMISSION_EXPENSE &&
              entry.side ===
                LedgerEntrySide.DEBIT,
          )
          .reduce(
            (
              sum,
              entry,
            ) =>
              sum +
              entry.amountNgn,
            0,
          );

      commissionByTxn.set(
        journal.referenceId,
        (commissionByTxn.get(
          journal.referenceId,
        ) ??
          0) +
          amount,
      );
    }

    const problems: Array<{
      txnId: string;
      reason: string;
    }> = [];

    let prepaid = 0;
    let legacy = 0;

    for (
      const sale
      of sales
    ) {
      const journal =
        sale.collectionLedgerTxn;

      if (
        !journal ||
        !sale.agentId
      ) {
        problems.push({
          txnId:
            sale.txnId,
          reason:
            'confirmed agent sale is missing agent or collection ledger',
        });
        continue;
      }

      const walletDebits =
        journal.entries.filter(
          (entry) =>
            entry.account
              .purpose ===
              LedgerAccountPurpose.AGENT_AVAILABLE &&
            entry.side ===
              LedgerEntrySide.DEBIT,
        );

      const receivableDebits =
        journal.entries.filter(
          (entry) =>
            entry.account
              .purpose ===
              LedgerAccountPurpose.AGENT_RECEIVABLE &&
            entry.side ===
              LedgerEntrySide.DEBIT,
        );

      const walletDebit =
        walletDebits.reduce(
          (
            sum,
            entry,
          ) =>
            sum +
            entry.amountNgn,
          0,
        );

      const receivableDebit =
        receivableDebits.reduce(
          (
            sum,
            entry,
          ) =>
            sum +
            entry.amountNgn,
          0,
        );

      if (
        walletDebit >
          0 &&
        receivableDebit >
          0
      ) {
        problems.push({
          txnId:
            sale.txnId,
          reason:
            'agent sale journal mixes prepaid wallet and legacy receivable',
        });
        continue;
      }

      if (
        walletDebit >
        0
      ) {
        prepaid +=
          1;

        const commission =
          commissionByTxn.get(
            sale.txnId,
          ) ??
          0;

        const wrongOwner =
          walletDebits.some(
            (entry) =>
              entry.account.ownerId !==
              sale.agentId,
          );

        if (
          wrongOwner ||
          journal.kind !==
            LedgerTransactionKind.AGENT_SALE ||
          walletDebit +
            commission !==
            sale.amountNgn
        ) {
          problems.push({
            txnId:
              sale.txnId,
            reason:
              'prepaid sale wallet debit + commission does not equal gross sale or owner is wrong',
          });
        }

        continue;
      }

      if (
        receivableDebit >
        0
      ) {
        legacy +=
          1;
        continue;
      }

      problems.push({
        txnId:
          sale.txnId,
        reason:
          'agent sale collection journal is neither prepaid wallet nor legacy receivable',
      });
    }

    return problems.length ===
      0
      ? this.pass(
          'agent.sales',
          'Agent sale accounting',
          `${prepaid} prepaid sale(s) are mathematically consistent; ${legacy} legacy receivable-backed sale(s) remain classified for history.`,
        )
      : this.blocker(
          'agent.sales',
          'Agent sale accounting',
          `${problems.length} agent sale accounting issue(s) found.`,
          {
            prepaid,
            legacy,
            problems:
              problems.slice(
                0,
                100,
              ),
          },
        );
  }

  private async checkAgentPrizeReimbursements(): Promise<CheckResult> {
    const claims =
      await this.prisma.prizeClaim.findMany({
        where: {
          paidByAgentId: {
            not:
              null,
          },
          status:
            PrizeClaimStatus.CASH_PAID,
        },
        include: {
          agentPayoutLedgerTxn: {
            include: {
              entries: {
                include: {
                  account:
                    true,
                },
              },
            },
          },
        },
      });

    const problems: Array<{
      claimId: string;
      reason: string;
    }> = [];

    let walletReimbursements =
      0;
    let legacyReceivable =
      0;

    for (
      const claim
      of claims
    ) {
      const journal =
        claim.agentPayoutLedgerTxn;

      if (
        !journal ||
        !claim.paidByAgentId
      ) {
        problems.push({
          claimId:
            claim.claimId,
          reason:
            'agent-paid claim is missing payout ledger linkage',
        });
        continue;
      }

      const walletCredits =
        journal.entries.filter(
          (entry) =>
            entry.account
              .purpose ===
              LedgerAccountPurpose.AGENT_AVAILABLE &&
            entry.side ===
              LedgerEntrySide.CREDIT,
        );

      const receivableCredits =
        journal.entries.filter(
          (entry) =>
            entry.account
              .purpose ===
              LedgerAccountPurpose.AGENT_RECEIVABLE &&
            entry.side ===
              LedgerEntrySide.CREDIT,
        );

      const walletCredit =
        walletCredits.reduce(
          (
            sum,
            entry,
          ) =>
            sum +
            entry.amountNgn,
          0,
        );

      const receivableCredit =
        receivableCredits.reduce(
          (
            sum,
            entry,
          ) =>
            sum +
            entry.amountNgn,
          0,
        );

      if (
        walletCredit >
          0 &&
        receivableCredit >
          0
      ) {
        problems.push({
          claimId:
            claim.claimId,
          reason:
            'agent prize payout mixes wallet reimbursement and legacy receivable',
        });
        continue;
      }

      const credited =
        walletCredit >
          0
          ? walletCredit
          : receivableCredit;

      if (
        credited !==
          claim.netPrizeValueNgn
      ) {
        problems.push({
          claimId:
            claim.claimId,
          reason:
            'agent prize payout journal does not equal net prize value',
        });
        continue;
      }

      if (
        walletCredit >
        0
      ) {
        walletReimbursements +=
          1;

        if (
          walletCredits.some(
            (entry) =>
              entry.account.ownerId !==
              claim.paidByAgentId,
          )
        ) {
          problems.push({
            claimId:
              claim.claimId,
            reason:
              'agent prize reimbursement credited the wrong agent wallet',
          });
        }
      } else if (
        receivableCredit >
        0
      ) {
        legacyReceivable +=
          1;
      } else {
        problems.push({
          claimId:
            claim.claimId,
          reason:
            'agent payout journal has no agent wallet/receivable credit',
        });
      }
    }

    return problems.length ===
      0
      ? this.pass(
          'agent.prize-reimbursement',
          'Agent prize reimbursement',
          `${walletReimbursements} wallet reimbursement(s) are consistent; ${legacyReceivable} legacy receivable-backed payout(s) remain historical.`,
        )
      : this.blocker(
          'agent.prize-reimbursement',
          'Agent prize reimbursement',
          `${problems.length} agent-paid prize accounting issue(s) found.`,
          problems.slice(
            0,
            100,
          ),
        );
  }

  private async checkBankPrizePayouts(): Promise<CheckResult> {
    const attempts =
      await this.prisma.prizePayoutAttempt.findMany({
        where: {
          status:
            PrizePayoutStatus.SUCCEEDED,
        },
        include: {
          payoutLedgerTxn: {
            include: {
              entries: {
                include: {
                  account:
                    true,
                },
              },
            },
          },
        },
      });

    const problems: Array<{
      attemptId: string;
      reason: string;
    }> = [];

    for (
      const attempt
      of attempts
    ) {
      const journal =
        attempt.payoutLedgerTxn;

      if (
        !journal ||
        !attempt.payoutLedgerTxnId ||
        !attempt.completedAt
      ) {
        problems.push({
          attemptId:
            attempt.attemptId,
          reason:
            'successful bank payout is missing ledger linkage or completedAt',
        });
        continue;
      }

      const payableDebit =
        journal.entries
          .filter(
            (entry) =>
              entry.account
                .purpose ===
                LedgerAccountPurpose.PRIZE_PAYABLE &&
              entry.side ===
                LedgerEntrySide.DEBIT,
          )
          .reduce(
            (
              sum,
              entry,
            ) =>
              sum +
              entry.amountNgn,
            0,
          );

      const clearingCredit =
        journal.entries
          .filter(
            (entry) =>
              entry.account
                .purpose ===
                LedgerAccountPurpose.PAYOUT_CLEARING &&
              entry.side ===
                LedgerEntrySide.CREDIT,
          )
          .reduce(
            (
              sum,
              entry,
            ) =>
              sum +
              entry.amountNgn,
            0,
          );

      if (
        journal.kind !==
          LedgerTransactionKind.PRIZE_PAYOUT ||
        journal.referenceType !==
          'PrizePayoutAttempt' ||
        journal.referenceId !==
          attempt.attemptId ||
        payableDebit !==
          attempt.amountNgn ||
        clearingCredit !==
          attempt.amountNgn
      ) {
        problems.push({
          attemptId:
            attempt.attemptId,
          reason:
            'successful prize payout journal does not match payable / payout clearing amount',
        });
      }
    }

    return problems.length ===
      0
      ? this.pass(
          'prize.bank-payouts',
          'Bank prize payout accounting',
          `${attempts.length} successful bank payout attempt(s) have matching payout journals.`,
        )
      : this.blocker(
          'prize.bank-payouts',
          'Bank prize payout accounting',
          `${problems.length} bank prize payout accounting issue(s) found.`,
          problems.slice(
            0,
            100,
          ),
        );
  }

  private async checkRetiredDebtSuspensions(): Promise<CheckResult> {
    const count =
      await this.prisma.agent.count({
        where: {
          status:
            AgentStatus.SUSPENDED,
          suspensionReason:
            'UNSETTLED_REMITTANCE',
        },
      });

    return count ===
      0
      ? this.pass(
          'agent.debt-suspension',
          'Retired remittance suspension',
          'No agent remains suspended solely for UNSETTLED_REMITTANCE.',
        )
      : this.blocker(
          'agent.debt-suspension',
          'Retired remittance suspension',
          `${count} agent(s) are still suspended under the retired UNSETTLED_REMITTANCE reason.`,
        );
  }

  private async checkReconciliation(): Promise<CheckResult> {
    const open =
      await this.prisma.reconciliationIssue.findMany({
        where: {
          status:
            ReconciliationIssueStatus.OPEN,
        },
        select: {
          issueId: true,
          type: true,
          severity: true,
          provider: true,
          internalReference:
            true,
          externalReference:
            true,
          varianceMinor:
            true,
        },
        orderBy: {
          createdAt:
            'desc',
        },
        take:
          200,
      });

    const critical =
      open.filter(
        (issue) =>
          issue.severity ===
          AuditSeverity.CRITICAL,
      );

    if (
      critical.length >
      0
    ) {
      return this.blocker(
        'reconciliation.open-issues',
        'Open reconciliation issues',
        `${critical.length} CRITICAL reconciliation issue(s) remain open.`,
        critical,
      );
    }

    if (
      open.length >
      0
    ) {
      return this.review(
        'reconciliation.open-issues',
        'Open reconciliation issues',
        `${open.length} non-critical reconciliation issue(s) remain open and require Finance disposition.`,
        open,
      );
    }

    return this.pass(
      'reconciliation.open-issues',
      'Open reconciliation issues',
      'No reconciliation issues are open.',
    );
  }

  private async checkSuspenseBalance(production: boolean): Promise<CheckResult> {
    const account =
      await this.prisma.ledgerAccount.findUnique({
        where: {
          code:
            SYSTEM_LEDGER_ACCOUNT_CODES.SUSPENSE,
        },
      });

    if (!account) {
      return this.blocker(
        'ledger.suspense',
        'Financial suspense balance',
        'The system suspense ledger account is missing.',
      );
    }

    const grouped =
      await this.prisma.ledgerEntry.groupBy({
        by: [
          'accountId',
          'side',
        ],
        where: {
          accountId:
            account.accountId,
        },
        _sum: {
          amountNgn:
            true,
        },
      });

    const totals =
      this.rawDebitCredit(
        grouped,
      ).get(
        account.accountId,
      ) ?? {
        debit:
          0,
        credit:
          0,
      };

    const balanceNgn =
      totals.credit -
      totals.debit;

    if (
      balanceNgn ===
      0
    ) {
      return this.pass(
        'ledger.suspense',
        'Financial suspense balance',
        'Financial Suspense has a zero balance.',
      );
    }

    return production
      ? this.blocker(
          'ledger.suspense',
          'Financial suspense balance',
          `Financial Suspense has an unresolved NGN ${balanceNgn} balance.`,
          {
            balanceNgn,
          },
        )
      : this.review(
          'ledger.suspense',
          'Financial suspense balance',
          `Financial Suspense has an NGN ${balanceNgn} balance that Finance must explain before production.`,
          {
            balanceNgn,
          },
        );
  }

  private async checkTreasury(production: boolean): Promise<CheckResult> {
    const expected = [
      {
        code:
          'TRSY:MONNIFY:COLLECTION',
        ledgerCode:
          SYSTEM_LEDGER_ACCOUNT_CODES.MONNIFY_COLLECTION_CLEARING,
      },
      {
        code:
          'TRSY:FLUTTERWAVE:COLLECTION',
        ledgerCode:
          SYSTEM_LEDGER_ACCOUNT_CODES.FLUTTERWAVE_CLEARING,
      },
      {
        code:
          'TRSY:MONNIFY:PAYOUT',
        ledgerCode:
          SYSTEM_LEDGER_ACCOUNT_CODES.MONNIFY_PAYOUT_CLEARING,
      },
      {
        code:
          'TRSY:FLUTTERWAVE:PAYOUT',
        ledgerCode:
          SYSTEM_LEDGER_ACCOUNT_CODES.FLUTTERWAVE_PAYOUT_CLEARING,
      },
      {
        code:
          'TRSY:BANK:PRIMARY',
        ledgerCode:
          SYSTEM_LEDGER_ACCOUNT_CODES.BANK_CASH,
      },
    ];

    const rows =
      await this.prisma.treasuryAccount.findMany({
        where: {
          code: {
            in:
              expected.map(
                (item) =>
                  item.code,
              ),
          },
        },
        include: {
          ledgerAccount:
            true,
        },
      });

    const byCode =
      new Map(
        rows.map(
          (row) => [
            row.code,
            row,
          ],
        ),
      );

    const problems: string[] =
      [];

    for (
      const item
      of expected
    ) {
      const row =
        byCode.get(
          item.code,
        );

      if (!row) {
        problems.push(
          `${item.code}: missing`,
        );
        continue;
      }

      if (
        row.status !==
          TreasuryAccountStatus.ACTIVE ||
        row.currency !==
          'NGN' ||
        row.ledgerAccount.code !==
          item.ledgerCode
      ) {
        problems.push(
          `${item.code}: identity/status mismatch`,
        );
      }
    }

    if (
      problems.length >
      0
    ) {
      return this.blocker(
        'treasury.registry',
        'Treasury registry',
        `${problems.length} treasury registry issue(s) found.`,
        problems,
      );
    }

    const accountIds =
      rows.map(
        (row) =>
          row.ledgerAccountId,
      );

    const grouped =
      accountIds.length ===
        0
        ? []
        : await this.prisma.ledgerEntry.groupBy({
            by: [
              'accountId',
              'side',
            ],
            where: {
              accountId: {
                in:
                  accountIds,
              },
            },
            _sum: {
              amountNgn:
                true,
            },
          });

    const totals =
      this.rawDebitCredit(
        grouped,
      );

    const balances =
      rows.map(
        (row) => {
          const total =
            totals.get(
              row.ledgerAccountId,
            ) ?? {
              debit:
                0,
              credit:
                0,
            };

          const balance =
            row.ledgerAccount.accountType ===
              LedgerAccountType.ASSET
              ? total.debit -
                total.credit
              : total.credit -
                total.debit;

          return {
            code:
              row.code,
            provider:
              row.provider,
            kind:
              row.kind,
            ledgerCode:
              row.ledgerAccount.code,
            balanceNgn:
              balance,
            externalAccountReference:
              row.externalAccountReference,
          };
        },
      );

    const monnifyPayout =
      byCode.get(
        'TRSY:MONNIFY:PAYOUT',
      );

    const primaryBank =
      byCode.get(
        'TRSY:BANK:PRIMARY',
      );

    const productionMissing =
      production
        ? [
            !monnifyPayout
              ?.externalAccountReference
              ? 'TRSY:MONNIFY:PAYOUT external account reference'
              : null,
            !primaryBank
              ?.externalAccountReference
              ? 'TRSY:BANK:PRIMARY external account reference'
              : null,
            !primaryBank
              ?.bankCode
              ? 'TRSY:BANK:PRIMARY bank code'
              : null,
            !primaryBank
              ?.accountLast4
              ? 'TRSY:BANK:PRIMARY account last4'
              : null,
          ].filter(
            (
              value,
            ): value is string =>
              Boolean(
                value,
              ),
          )
        : [];

    if (
      productionMissing.length >
      0
    ) {
      return this.blocker(
        'treasury.registry',
        'Treasury registry',
        `Treasury accounts exist, but ${productionMissing.length} production identity field(s) are missing.`,
        {
          missing:
            productionMissing,
          balances,
        },
      );
    }

    return this.pass(
      'treasury.registry',
      'Treasury registry',
      `All ${expected.length} treasury accounts are active and mapped to the expected ledger accounts.`,
      {
        balances,
      },
    );
  }

  private async checkMigration(production: boolean): Promise<CheckResult> {
    const latest =
      await this.prisma.financialMigrationRun.findFirst({
        orderBy: {
          createdAt:
            'desc',
        },
      });

    if (!latest) {
      return production
        ? this.blocker(
            'migration.phase8',
            'Phase 8 migration state',
            'No financial migration run exists.',
          )
        : this.review(
            'migration.phase8',
            'Phase 8 migration state',
            'No financial migration run exists in this database.',
          );
    }

    if (
      latest.status ===
      FinancialMigrationRunStatus.FINALIZED
    ) {
      return this.pass(
        'migration.phase8',
        'Phase 8 migration state',
        `Latest migration run ${latest.runId} is FINALIZED.`,
      );
    }

    return production
      ? this.blocker(
          'migration.phase8',
          'Phase 8 migration state',
          `Latest migration run ${latest.runId} is ${latest.status}, not FINALIZED.`,
        )
      : this.review(
          'migration.phase8',
          'Phase 8 migration state',
          `Latest migration run ${latest.runId} is ${latest.status}; finalize before production.`,
        );
  }

  private async checkHistoricalRemittance(): Promise<CheckResult> {
    const [
      pending,
      late,
      awaitingFinance,
    ] =
      await Promise.all([
        this.prisma.remittance.count({
          where: {
            status:
              RemittanceStatus.PENDING,
          },
        }),
        this.prisma.remittance.count({
          where: {
            status:
              RemittanceStatus.LATE,
          },
        }),
        this.prisma.remittance.count({
          where: {
            status:
              RemittanceStatus.AGENT_CONFIRMED,
          },
        }),
      ]);

    const outstanding =
      await this.prisma.remittance.aggregate({
        where: {
          status: {
            in: [
              RemittanceStatus.PENDING,
              RemittanceStatus.LATE,
            ],
          },
          amountDueNgn: {
            gt:
              0,
          },
        },
        _sum: {
          amountDueNgn:
            true,
        },
      });

    return this.pass(
      'legacy.remittance',
      'Historical remittance',
      `Historical obligations remain isolated: pending=${pending}, late=${late}, awaitingFinance=${awaitingFinance}, outstandingNGN=${outstanding._sum.amountDueNgn ?? 0}.`,
    );
  }

  private checkProductionConfiguration(): CheckResult {
    const required = [
      'PAYSTACK_SECRET_KEY',
      'MONNIFY_API_KEY',
      'MONNIFY_SECRET_KEY',
      'MONNIFY_CONTRACT_CODE',
      'MONNIFY_SOURCE_ACCOUNT_NUMBER',
      'FLUTTERWAVE_SECRET_KEY',
      'FLUTTERWAVE_WEBHOOK_HASH',
      'PAYMENT_CALLBACK_BASE_URL',
      'PUBLIC_WEB_BASE_URL',
      'AGENT_WEB_BASE_URL',
      'TREASURY_BANK_REFERENCE',
      'TREASURY_BANK_CODE',
      'TREASURY_BANK_ACCOUNT_LAST4',
      'FINANCIAL_LEDGER_CUTOVER_AT',
    ];

    const missing =
      required.filter(
        (key) =>
          !String(
            this.config.get(
              key,
            ) ??
              '',
          ).trim(),
      );

    const callbackValues = [
      'PAYMENT_CALLBACK_BASE_URL',
      'PUBLIC_WEB_BASE_URL',
      'AGENT_WEB_BASE_URL',
    ];

    const localUrls =
      callbackValues.filter(
        (key) => {
          const value =
            String(
              this.config.get(
                key,
              ) ??
                '',
            ).toLowerCase();

          return (
            value.includes(
              'localhost',
            ) ||
            value.includes(
              '127.0.0.1',
            )
          );
        },
      );

    const insecureUrls =
      callbackValues.filter(
        (key) => {
          const value =
            String(
              this.config.get(
                key,
              ) ??
                '',
            ).trim();

          return (
            value.length >
              0 &&
            !value.startsWith(
              'https://',
            )
          );
        },
      );

    const monnifyBase =
      String(
        this.config.get(
          'MONNIFY_BASE_URL',
        ) ??
          '',
      ).toLowerCase();

    const unsignedSandboxRaw =
      this.config.get<boolean | string>(
        'MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS',
      );

    const unsignedSandbox =
      unsignedSandboxRaw ===
        true ||
      String(
        unsignedSandboxRaw ??
          '',
      ).toLowerCase() ===
        'true';

    const problems = [
      ...missing.map(
        (key) =>
          `${key}: missing`,
      ),
      ...localUrls.map(
        (key) =>
          `${key}: still local`,
      ),
      ...insecureUrls.map(
        (key) =>
          `${key}: must use HTTPS in production`,
      ),
      String(
        this.config.get(
          'NODE_ENV',
        ) ??
          '',
      ) !==
        'production'
        ? 'NODE_ENV: must be production for the production rollout gate'
        : null,
      monnifyBase.includes(
        'sandbox',
      )
        ? 'MONNIFY_BASE_URL: still points to sandbox'
        : null,
      unsignedSandbox
        ? 'MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS: must be false'
        : null,
    ].filter(
      (
        value,
      ): value is string =>
        Boolean(
          value,
        ),
    );

    if (
      problems.length >
      0
    ) {
      return this.blocker(
        'config.production',
        'Production financial configuration',
        `${problems.length} production financial configuration issue(s) found.`,
        problems,
      );
    }

    const refundsMode =
      String(
        this.config.get(
          'REFUNDS_MODE',
        ) ??
          'dev',
      );

    if (
      refundsMode !==
      'live'
    ) {
      return this.review(
        'config.production',
        'Production financial configuration',
        'Provider/treasury configuration is populated; REFUNDS_MODE is not live and must be an explicit go-live decision.',
        {
          refundsMode,
        },
      );
    }

    return this.pass(
      'config.production',
      'Production financial configuration',
      'Required provider, callback, treasury, cutover, and webhook configuration is populated for production.',
    );
  }

  private liabilityBalances(
    rows: BalanceRow[],
  ) {
    const balances =
      new Map<
        string,
        number
      >();

    for (
      const row
      of rows
    ) {
      const amount =
        row._sum
          .amountNgn ??
        0;

      const signed =
        row.side ===
          LedgerEntrySide.CREDIT
          ? amount
          : -amount;

      balances.set(
        row.accountId,
        (balances.get(
          row.accountId,
        ) ??
          0) +
          signed,
      );
    }

    return balances;
  }

  private rawDebitCredit(
    rows: BalanceRow[],
  ) {
    const balances =
      new Map<
        string,
        {
          debit: number;
          credit: number;
        }
      >();

    for (
      const row
      of rows
    ) {
      const current =
        balances.get(
          row.accountId,
        ) ?? {
          debit:
            0,
          credit:
            0,
        };

      const amount =
        row._sum
          .amountNgn ??
        0;

      if (
        row.side ===
        LedgerEntrySide.DEBIT
      ) {
        current.debit +=
          amount;
      } else {
        current.credit +=
          amount;
      }

      balances.set(
        row.accountId,
        current,
      );
    }

    return balances;
  }

  private pass(
    id: string,
    label: string,
    summary: string,
    details?: unknown,
  ): CheckResult {
    return {
      id,
      label,
      status:
        'PASS',
      summary,
      ...(details === undefined
        ? {}
        : {
            details,
          }),
    };
  }

  private review(
    id: string,
    label: string,
    summary: string,
    details?: unknown,
  ): CheckResult {
    return {
      id,
      label,
      status:
        'REVIEW',
      summary,
      ...(details === undefined
        ? {}
        : {
            details,
          }),
    };
  }

  private blocker(
    id: string,
    label: string,
    summary: string,
    details?: unknown,
  ): CheckResult {
    return {
      id,
      label,
      status:
        'BLOCKER',
      summary,
      ...(details === undefined
        ? {}
        : {
            details,
          }),
    };
  }
}
