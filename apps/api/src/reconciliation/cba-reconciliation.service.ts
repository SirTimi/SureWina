import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuditActorType,
  AuditSeverity,
  CbaReconciliationRun,
  CbaReconciliationStatus,
  CbaTransferStatus,
  CbaWithdrawalStatus,
  PaymentGateway,
  Prisma,
  WalletFundingStatus,
  WitmangoWalletLinkStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WitmangoClientService } from '../integrations/witmango/witmango-client.service';
import { TreasuryProviderService } from '../treasury/treasury-provider.service';

export type ReconciliationIssue = {
  code: string;
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  detail?: Record<string, unknown>;
};

type AccountRead =
  | { ok: true; kobo: bigint; active: boolean }
  | { ok: false };

// Withdrawals whose money sits in Pending Withdrawals until they finish.
const LOCKED_WITHDRAWALS: CbaWithdrawalStatus[] = [
  CbaWithdrawalStatus.AWAITING_APPROVAL,
  CbaWithdrawalStatus.LOCKED,
  CbaWithdrawalStatus.PAYOUT_PENDING,
  CbaWithdrawalStatus.PAID,
];

// Top-ups whose money has reached the vault but not anyone's CBA account.
// NOT_PAID is excluded: Monnify has not confirmed that money arrived.
const UNCREDITED_TOP_UPS: WalletFundingStatus[] = [
  WalletFundingStatus.PENDING,
  WalletFundingStatus.PROCESSING,
  WalletFundingStatus.REVIEW_REQUIRED,
];

// How many CBA accounts are read at once. The CBA is the same system that
// serves live purchases; a reconciliation must not crowd them out.
const READ_CONCURRENCY = 5;

const STALE_MS = 10 * 60 * 1000;
const WAT_OFFSET_MS = 60 * 60 * 1000;

// Daily reconciliation of the vault (the Monnify wallet) against the book
// (every CBA savings account).
//
// The two are never expected to be equal: prize bank payouts and Monnify
// fees leave the vault without touching the book. So the verdict rests on:
//
//   Coverage  vault ≥ everything owed to customers and agents, counting
//             money in transit. A shortfall is critical.
//   Pending   SureWina's Pending Withdrawals account holds exactly what the
//             unfinished withdrawals say it should.
//
// The full vault-against-book difference is recorded for finance to
// explain, and raised as a warning past the configured tolerance.
//
// Nothing is corrected automatically. Every finding goes to finance.
@Injectable()
export class CbaReconciliationService {
  private readonly logger = new Logger(CbaReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly witmango: WitmangoClientService,
    private readonly treasury: TreasuryProviderService,
  ) {}

  async run(triggeredBy: string): Promise<ReturnType<CbaReconciliationService['toView']>> {
    const startedAt = new Date();
    const issues: ReconciliationIssue[] = [];
    let incomplete = false;

    // ── Vault ──
    let vaultKobo = 0n;

    try {
      const balance = await this.treasury.monnifyPayoutBalance();

      if (balance.currency !== 'NGN') {
        throw new Error(`Vault currency is ${balance.currency}`);
      }

      vaultKobo = balance.ledgerBalanceMinor;
    } catch (error) {
      incomplete = true;
      issues.push({
        code: 'VAULT_UNREADABLE',
        severity: 'CRITICAL',
        message: 'The Monnify wallet balance could not be read',
        detail: { error: this.message(error) },
      });
    }

    // ── Book: every customer and agent account ──
    const links = await this.prisma.witmangoWalletLink.findMany({
      where: {
        status: WitmangoWalletLinkStatus.ACTIVE,
        savingsAccountId: { not: null },
      },
      select: {
        walletId: true,
        purpose: true,
        savingsAccountId: true,
        wallet: { select: { ownerType: true } },
      },
    });

    let ownersKobo = 0n;
    let accountsRead = 0;
    let accountsFailed = 0;
    const unreadable: Array<Record<string, unknown>> = [];
    const negative: Array<Record<string, unknown>> = [];
    const inactive: Array<Record<string, unknown>> = [];

    const reads = await this.readAll(
      links.map((link) => link.savingsAccountId as number),
    );

    links.forEach((link, index) => {
      const read = reads[index];
      const ref = {
        walletId: link.walletId,
        purpose: link.purpose,
        savingsAccountId: link.savingsAccountId,
        ownerType: link.wallet.ownerType,
      };

      if (!read.ok) {
        accountsFailed += 1;
        unreadable.push(ref);
        return;
      }

      accountsRead += 1;
      ownersKobo += read.kobo;

      if (read.kobo < 0n) negative.push({ ...ref, balanceNgn: this.naira(read.kobo) });
      if (!read.active) inactive.push(ref);
    });

    if (unreadable.length > 0) {
      incomplete = true;
      issues.push({
        code: 'ACCOUNTS_UNREADABLE',
        severity: 'CRITICAL',
        message: `${unreadable.length} customer or agent CBA account(s) could not be read`,
        detail: { accounts: unreadable.slice(0, 100) },
      });
    }

    if (negative.length > 0) {
      issues.push({
        code: 'NEGATIVE_BALANCE',
        severity: 'CRITICAL',
        message: `${negative.length} CBA account(s) are overdrawn`,
        detail: { accounts: negative.slice(0, 100) },
      });
    }

    if (inactive.length > 0) {
      issues.push({
        code: 'ACCOUNT_NOT_ACTIVE',
        severity: 'WARNING',
        message: `${inactive.length} CBA account(s) SureWina treats as active are not active in the CBA`,
        detail: { accounts: inactive.slice(0, 100) },
      });
    }

    // ── Book: SureWina's own accounts ──
    const salesKobo = await this.readSystemAccount(
      'WITMANGO_SALES_ACCOUNT_ID',
      'SALES_ACCOUNT_UNREADABLE',
      'The SureWina sales account could not be read',
      issues,
    );

    const pendingKobo = await this.readSystemAccount(
      'WITMANGO_PENDING_WITHDRAWALS_ACCOUNT_ID',
      'PENDING_ACCOUNT_UNREADABLE',
      'The Pending Withdrawals account could not be read',
      issues,
    );

    if (salesKobo === null || pendingKobo === null) {
      incomplete = true;
    }

    // ── In transit, from SureWina's own records ──
    const [uncredited, paidUnsettled, lockedTotal, reviewWithdrawals, unsettledTransfers] =
      await Promise.all([
        this.prisma.walletFunding.aggregate({
          where: {
            gateway: PaymentGateway.MONNIFY,
            status: { in: UNCREDITED_TOP_UPS },
            NOT: { failureReason: 'NOT_PAID' },
            wallet: { reservedAccount: { isNot: null } },
          },
          _sum: { amountNgn: true },
          _count: true,
        }),
        this.prisma.cbaWithdrawal.aggregate({
          where: { status: CbaWithdrawalStatus.PAID },
          _sum: { amountNgn: true },
          _count: true,
        }),
        this.prisma.cbaWithdrawal.aggregate({
          where: { status: { in: LOCKED_WITHDRAWALS } },
          _sum: { amountNgn: true },
        }),
        this.prisma.cbaWithdrawal.count({
          where: { status: CbaWithdrawalStatus.REVIEW_REQUIRED },
        }),
        this.prisma.cbaTransfer.count({
          where: {
            OR: [
              { status: CbaTransferStatus.UNCERTAIN },
              {
                status: CbaTransferStatus.SENDING,
                updatedAt: { lt: new Date(Date.now() - STALE_MS) },
              },
            ],
          },
        }),
      ]);

    const uncreditedKobo = this.kobo(uncredited._sum.amountNgn);
    const paidUnsettledKobo = this.kobo(paidUnsettled._sum.amountNgn);
    const expectedPendingKobo = this.kobo(lockedTotal._sum.amountNgn);

    if (uncredited._count > 0) {
      issues.push({
        code: 'TOP_UPS_NOT_CREDITED',
        severity: 'WARNING',
        message: `${uncredited._count} top-up(s) have reached the vault but are not credited`,
        detail: { amountNgn: this.naira(uncreditedKobo) },
      });
    }

    if (paidUnsettled._count > 0) {
      issues.push({
        code: 'WITHDRAWALS_NOT_SETTLED',
        severity: 'WARNING',
        message: `${paidUnsettled._count} withdrawal(s) were paid out but are still in the Pending Withdrawals book`,
        detail: { amountNgn: this.naira(paidUnsettledKobo) },
      });
    }

    if (reviewWithdrawals > 0) {
      issues.push({
        code: 'WITHDRAWALS_UNDER_REVIEW',
        severity: 'WARNING',
        message: `${reviewWithdrawals} withdrawal(s) are under review; their money may be in Pending Withdrawals or not`,
      });
    }

    if (unsettledTransfers > 0) {
      issues.push({
        code: 'TRANSFERS_UNCERTAIN',
        severity: 'WARNING',
        message: `${unsettledTransfers} CBA transfer(s) have an unknown outcome; balances may move when they are resolved`,
      });
    }

    // ── Verdict ──
    const owners = ownersKobo;
    const sales = salesKobo ?? 0n;
    const pending = pendingKobo ?? 0n;

    // Owed to customers and agents: their accounts, plus money locked for
    // their withdrawals, plus top-ups not yet credited — less withdrawals
    // already paid out of the vault but not yet out of the book.
    const obligationsKobo = owners + pending - paidUnsettledKobo + uncreditedKobo;
    const coverageKobo = vaultKobo - obligationsKobo;

    // Coverage less SureWina's own sales account: what the vault holds that
    // the book does not explain.
    const unexplainedKobo = coverageKobo - sales;

    let mismatch = negative.length > 0;

    if (!incomplete) {
      if (coverageKobo < 0n) {
        issues.push({
          code: 'COVERAGE_SHORTFALL',
          severity: 'CRITICAL',
          message: `The vault holds ₦${this.format(-coverageKobo)} less than is owed to customers and agents`,
          detail: {
            vaultNgn: this.naira(vaultKobo),
            obligationsNgn: this.naira(obligationsKobo),
          },
        });
      }

      if (pending !== expectedPendingKobo) {
        mismatch = true;
        issues.push({
          code: 'PENDING_WITHDRAWALS_MISMATCH',
          severity: reviewWithdrawals > 0 ? 'WARNING' : 'CRITICAL',
          message: `Pending Withdrawals holds ₦${this.format(pending)}; unfinished withdrawals account for ₦${this.format(expectedPendingKobo)}`,
          detail: {
            differenceNgn: this.naira(pending - expectedPendingKobo),
            withdrawalsUnderReview: reviewWithdrawals,
          },
        });
      }

      const toleranceKobo = this.kobo(
        Number(this.config.get('CBA_RECONCILIATION_TOLERANCE_NGN') ?? 0),
      );

      const absUnexplained = unexplainedKobo < 0n ? -unexplainedKobo : unexplainedKobo;

      if (absUnexplained > toleranceKobo) {
        issues.push({
          code: 'VAULT_BOOK_DIFFERENCE',
          severity: 'WARNING',
          message: `The vault and the book differ by ₦${this.format(unexplainedKobo)} beyond money in transit. Expected sources: Monnify fees, prize bank payouts, SureWina's own transfers.`,
          detail: { unexplainedNgn: this.naira(unexplainedKobo) },
        });
      }
    }

    const status = incomplete
      ? CbaReconciliationStatus.INCOMPLETE
      : coverageKobo < 0n
        ? CbaReconciliationStatus.SHORTFALL
        : mismatch
          ? CbaReconciliationStatus.MISMATCH
          : CbaReconciliationStatus.PASS;

    const run = await this.prisma.cbaReconciliationRun.create({
      data: {
        businessDate: new Date(`${this.watDate()}T00:00:00.000Z`),
        status,
        triggeredBy: triggeredBy.slice(0, 64),
        vaultKobo,
        ownersKobo: owners,
        salesKobo: sales,
        pendingWithdrawalsKobo: pending,
        uncreditedTopUpsKobo: uncreditedKobo,
        paidUnsettledKobo,
        obligationsKobo,
        coverageKobo,
        unexplainedKobo,
        expectedPendingKobo,
        accountsRead,
        accountsFailed,
        issues: issues as unknown as Prisma.InputJsonValue,
        startedAt,
        completedAt: new Date(),
      },
    });

    await this.audit
      .write({
        severity:
          status === CbaReconciliationStatus.PASS
            ? AuditSeverity.INFO
            : status === CbaReconciliationStatus.SHORTFALL
              ? AuditSeverity.CRITICAL
              : AuditSeverity.WARNING,
        actor:
          triggeredBy === 'schedule'
            ? { type: AuditActorType.SYSTEM, id: 'cba-reconciliation' }
            : { type: AuditActorType.ADMIN, id: triggeredBy },
        action: 'CBA_RECONCILIATION_COMPLETED',
        resource: { type: 'CbaReconciliationRun', id: run.runId },
        metadata: {
          status,
          coverageNgn: this.naira(coverageKobo),
          issues: issues.length,
        },
      })
      .catch((error) => {
        this.logger.error(`Audit failed for reconciliation: ${this.message(error)}`);
      });

    this.logger.log(
      `CBA reconciliation ${status}: coverage ₦${this.format(coverageKobo)}, ${issues.length} issue(s)`,
    );

    return this.toView(run);
  }

  async listRuns(limit = 30) {
    const runs = await this.prisma.cbaReconciliationRun.findMany({
      orderBy: { completedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    return runs.map((run) => this.toView(run));
  }

  async getRun(runId: string) {
    const run = await this.prisma.cbaReconciliationRun.findUnique({
      where: { runId },
    });

    if (!run) {
      throw new NotFoundException('Reconciliation run not found');
    }

    return this.toView(run);
  }

  async latest() {
    return this.prisma.cbaReconciliationRun.findFirst({
      orderBy: { completedAt: 'desc' },
    });
  }

  // Whether today's scheduled run has already happened.
  async hasScheduledRunToday(): Promise<boolean> {
    const count = await this.prisma.cbaReconciliationRun.count({
      where: {
        businessDate: new Date(`${this.watDate()}T00:00:00.000Z`),
        triggeredBy: 'schedule',
      },
    });

    return count > 0;
  }

  watDate(now = Date.now()): string {
    return new Date(now + WAT_OFFSET_MS).toISOString().slice(0, 10);
  }

  // ─── helpers ──────────────────────────────────────────────

  private async readSystemAccount(
    setting: string,
    code: string,
    message: string,
    issues: ReconciliationIssue[],
  ): Promise<bigint | null> {
    const accountId = Number(this.config.get(setting));

    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
      issues.push({ code, severity: 'CRITICAL', message: `${message}: ${setting} is not configured` });
      return null;
    }

    const [read] = await this.readAll([accountId]);

    if (!read.ok) {
      issues.push({ code, severity: 'CRITICAL', message });
      return null;
    }

    return read.kobo;
  }

  // Reads accounts a few at a time. A failed read is reported, never taken
  // as a zero balance.
  private async readAll(accountIds: number[]): Promise<AccountRead[]> {
    const results: AccountRead[] = new Array(accountIds.length);
    let next = 0;

    const worker = async () => {
      while (next < accountIds.length) {
        const index = next++;

        try {
          const account = await this.witmango.getSavingsAccount(accountIds[index]);

          results[index] = {
            ok: true,
            kobo: BigInt(Math.round(account.summary.accountBalance * 100)),
            active: account.status.id === 300,
          };
        } catch {
          results[index] = { ok: false };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(READ_CONCURRENCY, accountIds.length) }, worker),
    );

    return results;
  }

  private kobo(naira: number | null | undefined): bigint {
    return BigInt(Math.round((naira ?? 0) * 100));
  }

  // Exact for any balance SureWina will see; kobo stay as the fraction.
  private naira(kobo: bigint): number {
    return Number(kobo) / 100;
  }

  private format(kobo: bigint): string {
    return this.naira(kobo).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown';
  }

  private toView(run: CbaReconciliationRun) {
    return {
      runId: run.runId,
      businessDate: run.businessDate.toISOString().slice(0, 10),
      status: run.status,
      triggeredBy: run.triggeredBy,
      vaultNgn: this.naira(run.vaultKobo),
      ownersNgn: this.naira(run.ownersKobo),
      salesNgn: this.naira(run.salesKobo),
      pendingWithdrawalsNgn: this.naira(run.pendingWithdrawalsKobo),
      expectedPendingWithdrawalsNgn: this.naira(run.expectedPendingKobo),
      uncreditedTopUpsNgn: this.naira(run.uncreditedTopUpsKobo),
      paidUnsettledWithdrawalsNgn: this.naira(run.paidUnsettledKobo),
      obligationsNgn: this.naira(run.obligationsKobo),
      coverageNgn: this.naira(run.coverageKobo),
      unexplainedNgn: this.naira(run.unexplainedKobo),
      accountsRead: run.accountsRead,
      accountsFailed: run.accountsFailed,
      issues: run.issues as unknown as ReconciliationIssue[],
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt.toISOString(),
    };
  }
}
