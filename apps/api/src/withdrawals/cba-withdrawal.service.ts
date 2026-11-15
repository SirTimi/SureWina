import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuditActorType,
  AuditSeverity,
  CbaTransferPurpose,
  CbaTransferStatus,
  CbaWithdrawal,
  CbaWithdrawalStatus,
  LedgerOwnerType,
  Prisma,
  PrizePayoutStatus,
  WitmangoWalletPurpose,
} from '@prisma/client';

import { randomUUID } from 'crypto';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  WitmangoClientService,
  WitmangoTransferEndpoint,
  WitmangoUncertainOutcomeError,
} from '../integrations/witmango/witmango-client.service';
import { WitmangoWalletLinkService } from '../integrations/witmango/witmango-wallet-link.service';
import { WitmangoTransferService } from '../integrations/witmango/witmango-transfer.service';
import { MonnifyPrizePayoutProvider } from '../claims/payout/monnify-prize-payout.provider';
import type { PrizePayoutProviderResult } from '../claims/payout/prize-payout.provider';

import {
  WalletOwner,
  WithdrawalAccountService,
} from './withdrawal-account.service';

export type RequestWithdrawalInput = {
  withdrawalAccountId: string;
  amountNgn: number;
  requestId: string;
};

export type CbaWithdrawalView = {
  withdrawalId: string;
  status: CbaWithdrawalStatus;
  amountNgn: number;
  bankCode: string;
  accountLast4: string;
  requiresApproval: boolean;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
};

// Why a withdrawal stopped. Stable codes: finance filters on them.
const REASON = {
  LOCK_REFUSED: 'LOCK_REFUSED',
  LOCK_UNCERTAIN: 'LOCK_UNCERTAIN',
  DESTINATION_UNAVAILABLE: 'DESTINATION_UNAVAILABLE',
  PAYOUT_FAILED: 'PAYOUT_FAILED',
  PAYOUT_AMOUNT_MISMATCH: 'PAYOUT_AMOUNT_MISMATCH',
  PAYOUT_REVERSED_AFTER_PAYMENT: 'PAYOUT_REVERSED_AFTER_PAYMENT',
  REJECTED_BY_FINANCE: 'REJECTED_BY_FINANCE',
  RESTORE_NOT_POSTED: 'RESTORE_NOT_POSTED',
  SETTLEMENT_FAILED: 'SETTLEMENT_FAILED',
  SETTLEMENT_UNCERTAIN: 'SETTLEMENT_UNCERTAIN',
} as const;

// Withdrawals that are still moving. One at a time per wallet.
const IN_FLIGHT: CbaWithdrawalStatus[] = [
  CbaWithdrawalStatus.LOCKING,
  CbaWithdrawalStatus.AWAITING_APPROVAL,
  CbaWithdrawalStatus.LOCKED,
  CbaWithdrawalStatus.PAYOUT_PENDING,
];

// Withdrawals that did not take money out, and so do not count towards the
// daily limit.
const NOT_COUNTED: CbaWithdrawalStatus[] = [
  CbaWithdrawalStatus.FAILED,
  CbaWithdrawalStatus.RESTORED,
];

// Statuses from which locked money can be sent back.
const RESTORABLE: CbaWithdrawalStatus[] = [
  CbaWithdrawalStatus.AWAITING_APPROVAL,
  CbaWithdrawalStatus.LOCKED,
  CbaWithdrawalStatus.PAYOUT_PENDING,
];

// Withdrawable money: only winnings for customers, only commission and
// reimbursed prizes for agents. Deposits and Float are never withdrawable.
const SOURCE_PURPOSE: Partial<Record<LedgerOwnerType, WitmangoWalletPurpose>> = {
  [LedgerOwnerType.CUSTOMER]: WitmangoWalletPurpose.WINNINGS,
  [LedgerOwnerType.AGENT]: WitmangoWalletPurpose.EARNINGS,
};

// Monnify answers "no such transfer" for a payout it has not finished
// creating. Soon after submission that is not proof the payout failed.
const NOT_FOUND_GRACE_MS = 30 * 60 * 1000;

const WAT_OFFSET_MS = 60 * 60 * 1000;

function reviewMessage(withdrawalId: string): string {
  return (
    'We could not confirm your withdrawal. Your money is safe: support will ' +
    `check it and either complete it or return it. Reference: ${withdrawalId}`
  );
}

// Withdrawals from a CBA wallet to a saved bank account.
//
//   1. Lock    Winnings/Earnings -> Pending Withdrawals (CBA transfer). From
//              here the money cannot be spent on tickets or withdrawn twice.
//   2. Pay     Monnify transfer to the saved account, under a reference
//              fixed in advance so it can be queried, never re-sent.
//   3. Settle  On success, a CBA withdrawal out of Pending Withdrawals, so the
//              book agrees with the money that left the vault.
//      Restore On failure, Pending Withdrawals -> back where it came from.
//
// Every step is written down before it runs. An unknown answer at any step
// stops it there for a person — money is never moved again on a guess.
@Injectable()
export class CbaWithdrawalService {
  private readonly logger = new Logger(CbaWithdrawalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly accounts: WithdrawalAccountService,
    private readonly cbaLinks: WitmangoWalletLinkService,
    private readonly cbaTransfers: WitmangoTransferService,
    private readonly witmango: WitmangoClientService,
    private readonly payouts: MonnifyPrizePayoutProvider,
  ) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('WALLET_WITHDRAWALS_ENABLED') === true;
  }

  async list(owner: WalletOwner): Promise<CbaWithdrawalView[]> {
    const rows = await this.prisma.cbaWithdrawal.findMany({
      where: { walletId: owner.walletId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return rows.map((row) => this.toView(row));
  }

  async listForFinance(status?: CbaWithdrawalStatus) {
    const rows = await this.prisma.cbaWithdrawal.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return rows.map((row) => ({
      ...this.toView(row),
      walletId: row.walletId,
      ownerType: row.ownerType,
      payoutReference: row.payoutReference,
      payoutStatus: row.payoutStatus,
      payoutRawStatus: row.payoutRawStatus,
      settledAt: row.settledAt?.toISOString() ?? null,
    }));
  }

  async request(
    owner: WalletOwner,
    input: RequestWithdrawalInput,
  ): Promise<CbaWithdrawalView> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Withdrawals are not available yet',
      );
    }

    const requestId = input.requestId?.trim();

    if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId ?? '')) {
      throw new BadRequestException('A valid request ID is required');
    }

    // The same request again is the same withdrawal.
    const existing = await this.prisma.cbaWithdrawal.findUnique({
      where: { walletId_requestId: { walletId: owner.walletId, requestId } },
    });

    if (existing) {
      return this.replay(existing, input);
    }

    const purpose = SOURCE_PURPOSE[owner.ownerType];

    if (!purpose) {
      throw new ConflictException('This wallet cannot make withdrawals');
    }

    if ((await this.cbaLinks.getState(owner.walletId)) !== 'READY') {
      throw new ConflictException('Your wallet is not ready for withdrawals');
    }

    const limits = this.limits(owner.ownerType);
    const amountNgn = input.amountNgn;

    if (!Number.isSafeInteger(amountNgn) || amountNgn <= 0) {
      throw new BadRequestException(
        'Amount must be a whole number of naira',
      );
    }

    if (amountNgn < limits.minNgn) {
      throw new ConflictException(
        `The minimum withdrawal is ₦${limits.minNgn.toLocaleString('en-NG')}`,
      );
    }

    if (amountNgn > limits.perRequestNgn) {
      throw new ConflictException(
        `The maximum per withdrawal is ₦${limits.perRequestNgn.toLocaleString('en-NG')}`,
      );
    }

    const source = await this.cbaLinks.getActiveAccount(owner.walletId, purpose);
    const pending = this.pendingEndpoint();

    // Only to a saved, BVN-matched account past its cooling-off.
    const destination = await this.accounts.requireUsable(
      owner.walletId,
      input.withdrawalAccountId,
    );

    let availableNgn: number;

    try {
      availableNgn = await this.cbaTransfers.availableNgn(source);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Withdrawals are temporarily unavailable. Please try again shortly.',
      );
    }

    const maxByShareNgn = Math.floor(
      (availableNgn * limits.maxPercentOfBalance) / 100,
    );

    if (amountNgn > maxByShareNgn) {
      throw new ConflictException(
        maxByShareNgn > 0
          ? `You can withdraw up to ₦${maxByShareNgn.toLocaleString('en-NG')} right now`
          : 'You have no withdrawable balance',
      );
    }

    const withdrawalId = randomUUID();

    let created: CbaWithdrawal;

    try {
      created = await this.prisma.$transaction(
        async (tx) => {
          const inFlight = await tx.cbaWithdrawal.count({
            where: { walletId: owner.walletId, status: { in: IN_FLIGHT } },
          });

          if (inFlight > 0) {
            throw new ConflictException(
              'You already have a withdrawal in progress',
            );
          }

          const today = await tx.cbaWithdrawal.aggregate({
            where: {
              walletId: owner.walletId,
              createdAt: { gte: this.startOfWatDay() },
              status: { notIn: NOT_COUNTED },
            },
            _sum: { amountNgn: true },
          });

          const usedNgn = today._sum.amountNgn ?? 0;

          if (usedNgn + amountNgn > limits.dailyNgn) {
            const leftNgn = Math.max(0, limits.dailyNgn - usedNgn);

            throw new ConflictException(
              leftNgn > 0
                ? `You can withdraw ₦${leftNgn.toLocaleString('en-NG')} more today`
                : 'You have reached today’s withdrawal limit',
            );
          }

          // Written down before it is sent.
          const lock = await this.cbaTransfers.createInTransaction(tx, {
            purpose: CbaTransferPurpose.WITHDRAWAL_LOCK,
            walletId: owner.walletId,
            from: this.cbaTransfers.endpoint(source),
            to: pending,
            amountNgn,
          });

          return tx.cbaWithdrawal.create({
            data: {
              withdrawalId,
              walletId: owner.walletId,
              ownerType: owner.ownerType,
              requestId,
              withdrawalAccountId: destination.withdrawalAccountId,
              sourcePurpose: purpose,
              amountNgn,
              status: CbaWithdrawalStatus.LOCKING,
              bankCode: destination.bankCode,
              accountLast4: destination.accountLast4,
              accountFingerprint: destination.accountFingerprint,
              lockTransferId: lock.transferId,
              requiresApproval:
                limits.approvalThresholdNgn > 0 &&
                amountNgn > limits.approvalThresholdNgn,
              payoutReference: `sw-wdr-${withdrawalId}`,
              settlementReference: `sw-wds-${withdrawalId}`,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.cbaWithdrawal.findUnique({
          where: { walletId_requestId: { walletId: owner.walletId, requestId } },
        });

        if (raced) {
          return this.replay(raced, input);
        }
      }

      throw error;
    }

    await this.writeAudit(owner.actor, created.withdrawalId, {
      severity: AuditSeverity.INFO,
      action: 'CBA_WITHDRAWAL_REQUESTED',
      metadata: {
        amountNgn,
        ownerType: owner.ownerType,
        accountLast4: created.accountLast4,
        requiresApproval: created.requiresApproval,
      },
    });

    // ── 1. Lock ──
    const lock = await this.cbaTransfers.execute(created.lockTransferId!);

    if (lock.status === CbaTransferStatus.FAILED) {
      await this.move(created.withdrawalId, [CbaWithdrawalStatus.LOCKING], {
        status: CbaWithdrawalStatus.FAILED,
        failureReason: REASON.LOCK_REFUSED,
      });

      throw new ConflictException(
        'Your withdrawal could not be started. No money moved.',
      );
    }

    if (lock.status !== CbaTransferStatus.POSTED) {
      await this.toReview(created.withdrawalId, REASON.LOCK_UNCERTAIN);

      throw new ServiceUnavailableException(reviewMessage(created.withdrawalId));
    }

    await this.move(created.withdrawalId, [CbaWithdrawalStatus.LOCKING], {
      status: created.requiresApproval
        ? CbaWithdrawalStatus.AWAITING_APPROVAL
        : CbaWithdrawalStatus.LOCKED,
    });

    // ── 2. Pay ── (unless finance must approve first)
    if (!created.requiresApproval) {
      await this.pay(created.withdrawalId);
    }

    return this.view(created.withdrawalId);
  }

  // Finance releases a withdrawal held for approval. The money is already
  // locked, so approving only lets the payout go.
  async approve(withdrawalId: string, adminId: string) {
    const moved = await this.move(
      withdrawalId,
      [CbaWithdrawalStatus.AWAITING_APPROVAL],
      {
        status: CbaWithdrawalStatus.LOCKED,
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    );

    if (!moved) {
      throw new ConflictException('Only a withdrawal awaiting approval can be approved');
    }

    await this.writeAudit({ type: AuditActorType.ADMIN, id: adminId }, withdrawalId, {
      severity: AuditSeverity.WARNING,
      action: 'CBA_WITHDRAWAL_APPROVED',
      metadata: {},
    });

    await this.pay(withdrawalId);

    return this.view(withdrawalId);
  }

  // Finance refuses a withdrawal held for approval. The locked money goes
  // back where it came from.
  async reject(withdrawalId: string, adminId: string) {
    const moved = await this.move(
      withdrawalId,
      [CbaWithdrawalStatus.AWAITING_APPROVAL],
      { rejectedBy: adminId, rejectedAt: new Date() },
    );

    if (!moved) {
      throw new ConflictException('Only a withdrawal awaiting approval can be rejected');
    }

    await this.writeAudit({ type: AuditActorType.ADMIN, id: adminId }, withdrawalId, {
      severity: AuditSeverity.WARNING,
      action: 'CBA_WITHDRAWAL_REJECTED',
      metadata: {},
    });

    await this.restore(withdrawalId, REASON.REJECTED_BY_FINANCE);

    return this.view(withdrawalId);
  }

  // Moves a withdrawal on from wherever it is waiting: pays a locked one,
  // asks Monnify about a pending payout, or settles a paid one. Never sends
  // anything a second time.
  async refresh(withdrawalId: string) {
    const withdrawal = await this.require(withdrawalId);

    if (withdrawal.status === CbaWithdrawalStatus.LOCKED) {
      await this.pay(withdrawalId);
    } else if (withdrawal.status === CbaWithdrawalStatus.PAYOUT_PENDING) {
      await this.syncPayout(withdrawal);
    } else if (withdrawal.status === CbaWithdrawalStatus.PAID) {
      await this.settle(withdrawalId);
    }

    return this.view(withdrawalId);
  }

  // From the Monnify disbursement webhook. The notification itself is not
  // trusted: the status is asked of Monnify directly.
  async syncByReference(
    reference: string,
  ): Promise<{ found: boolean; changed: boolean }> {
    const withdrawal = await this.prisma.cbaWithdrawal.findUnique({
      where: { payoutReference: reference },
    });

    if (!withdrawal) {
      return { found: false, changed: false };
    }

    const before = withdrawal.status;

    // A notification can arrive after the payout already succeeded — a
    // bank reversal, say. So Monnify is asked about paid and settled
    // withdrawals too, not only pending ones; a reversal then goes to review.
    if (
      before === CbaWithdrawalStatus.PAYOUT_PENDING ||
      before === CbaWithdrawalStatus.PAID ||
      before === CbaWithdrawalStatus.SUCCEEDED
    ) {
      await this.syncPayout(withdrawal);
    }

    const current = await this.require(withdrawal.withdrawalId);

    if (current.status === CbaWithdrawalStatus.PAID) {
      await this.settle(current.withdrawalId);
    } else if (current.status === CbaWithdrawalStatus.LOCKED) {
      await this.pay(current.withdrawalId);
    }

    const after = (await this.require(withdrawal.withdrawalId)).status;

    return { found: true, changed: before !== after };
  }

  // After finance has resolved an uncertain lock. Posted: the money is
  // locked, so the withdrawal carries on as requested. Not posted: nothing
  // moved, and the withdrawal ends.
  async continueAfterLockResolved(withdrawalId: string) {
    const withdrawal = await this.prisma.cbaWithdrawal.findUnique({
      where: { withdrawalId },
      include: { lockTransfer: true },
    });

    if (
      !withdrawal ||
      withdrawal.status !== CbaWithdrawalStatus.REVIEW_REQUIRED ||
      withdrawal.failureReason !== REASON.LOCK_UNCERTAIN ||
      !withdrawal.lockTransfer
    ) {
      return withdrawal ? this.toView(withdrawal) : null;
    }

    if (withdrawal.lockTransfer.status === CbaTransferStatus.POSTED) {
      await this.move(withdrawalId, [CbaWithdrawalStatus.REVIEW_REQUIRED], {
        status: withdrawal.requiresApproval
          ? CbaWithdrawalStatus.AWAITING_APPROVAL
          : CbaWithdrawalStatus.LOCKED,
        failureReason: null,
      });

      if (!withdrawal.requiresApproval) {
        await this.pay(withdrawalId);
      }
    } else if (withdrawal.lockTransfer.status === CbaTransferStatus.FAILED) {
      await this.move(withdrawalId, [CbaWithdrawalStatus.REVIEW_REQUIRED], {
        status: CbaWithdrawalStatus.FAILED,
        failureReason: REASON.LOCK_REFUSED,
      });
    }

    return this.view(withdrawalId);
  }

  // After finance has resolved an uncertain restore. Posted: the money is
  // back. Not posted: it is sent again — a definite refusal moved nothing.
  async continueAfterRestoreResolved(withdrawalId: string) {
    const withdrawal = await this.prisma.cbaWithdrawal.findUnique({
      where: { withdrawalId },
      include: { restoreTransfer: true },
    });

    if (
      !withdrawal ||
      withdrawal.status !== CbaWithdrawalStatus.REVIEW_REQUIRED ||
      !withdrawal.restoreTransfer
    ) {
      return withdrawal ? this.toView(withdrawal) : null;
    }

    let restore = withdrawal.restoreTransfer;

    if (restore.status === CbaTransferStatus.FAILED) {
      restore = await this.cbaTransfers.retryReturn(restore.transferId);
    }

    if (restore.status === CbaTransferStatus.POSTED) {
      await this.move(withdrawalId, [CbaWithdrawalStatus.REVIEW_REQUIRED], {
        status: CbaWithdrawalStatus.RESTORED,
      });
    }

    return this.view(withdrawalId);
  }

  // ─── steps ────────────────────────────────────────────────

  private async pay(withdrawalId: string): Promise<void> {
    const claimed = await this.move(withdrawalId, [CbaWithdrawalStatus.LOCKED], {
      status: CbaWithdrawalStatus.PAYOUT_PENDING,
      payoutSubmittedAt: new Date(),
    });

    if (!claimed) {
      return;
    }

    const withdrawal = await this.require(withdrawalId);

    // The account is checked again at the moment of paying: it may have
    // been removed since the request.
    let destination;

    try {
      destination = await this.accounts.requireUsable(
        withdrawal.walletId,
        withdrawal.withdrawalAccountId,
      );
    } catch {
      destination = null;
    }

    if (
      !destination ||
      destination.accountFingerprint !== withdrawal.accountFingerprint
    ) {
      await this.restore(withdrawalId, REASON.DESTINATION_UNAVAILABLE);
      return;
    }

    let result: PrizePayoutProviderResult | null;

    try {
      result = await this.payouts.initiate({
        idempotencyKey: withdrawal.payoutReference,
        accountNumber: destination.accountNumber,
        bankCode: destination.bankCode,
        accountName: destination.accountName,
        amountNgn: withdrawal.amountNgn,
        reason: 'SureWina withdrawal',
      });
    } catch (error) {
      // The request may have reached Monnify. Leave it pending; it is
      // queried by its reference, never sent again.
      this.logger.warn(
        `Withdrawal ${withdrawalId} payout outcome unknown: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      result = null;
    }

    if (!result) {
      await this.prisma.cbaWithdrawal.update({
        where: { withdrawalId },
        data: {
          payoutStatus: PrizePayoutStatus.UNKNOWN,
          payoutLastCheckedAt: new Date(),
        },
      });
      return;
    }

    await this.applyPayout(withdrawal, result);
  }

  private async syncPayout(withdrawal: CbaWithdrawal): Promise<void> {
    let result: PrizePayoutProviderResult | null;

    try {
      result = await this.payouts.getStatus(withdrawal.payoutReference);
    } catch {
      result = null;
    }

    if (!result) {
      await this.prisma.cbaWithdrawal.update({
        where: { withdrawalId: withdrawal.withdrawalId },
        data: { payoutLastCheckedAt: new Date() },
      });
      return;
    }

    const recentlySubmitted =
      !!withdrawal.payoutSubmittedAt &&
      Date.now() - withdrawal.payoutSubmittedAt.getTime() < NOT_FOUND_GRACE_MS;

    if (
      result.status === PrizePayoutStatus.FAILED &&
      result.rawStatus === 'D02' &&
      recentlySubmitted
    ) {
      await this.prisma.cbaWithdrawal.update({
        where: { withdrawalId: withdrawal.withdrawalId },
        data: { payoutLastCheckedAt: new Date() },
      });
      return;
    }

    await this.applyPayout(withdrawal, result);
  }

  private async applyPayout(
    withdrawal: CbaWithdrawal,
    result: PrizePayoutProviderResult,
  ): Promise<void> {
    const id = withdrawal.withdrawalId;

    const observed = {
      payoutStatus: result.status,
      payoutRawStatus: result.rawStatus?.slice(0, 64) ?? null,
      providerTransactionReference:
        result.providerTransactionId?.slice(0, 120) ??
        withdrawal.providerTransactionReference,
      payoutLastCheckedAt: new Date(),
    };

    if (result.status === PrizePayoutStatus.SUCCEEDED) {
      if (result.amountNgn != null && result.amountNgn !== withdrawal.amountNgn) {
        await this.prisma.cbaWithdrawal.update({ where: { withdrawalId: id }, data: observed });
        await this.toReview(id, REASON.PAYOUT_AMOUNT_MISMATCH);
        return;
      }

      const paid = await this.move(id, [CbaWithdrawalStatus.PAYOUT_PENDING], {
        ...observed,
        status: CbaWithdrawalStatus.PAID,
        payoutCompletedAt: new Date(),
      });

      if (paid) {
        await this.writeAudit({ type: AuditActorType.SYSTEM, id: 'cba-withdrawals' }, id, {
          severity: AuditSeverity.INFO,
          action: 'CBA_WITHDRAWAL_PAID',
          metadata: { amountNgn: withdrawal.amountNgn },
        });

        // ── 3. Settle ──
        await this.settle(id);
      }

      return;
    }

    if (
      result.status === PrizePayoutStatus.FAILED ||
      result.status === PrizePayoutStatus.REVERSED
    ) {
      await this.prisma.cbaWithdrawal.update({ where: { withdrawalId: id }, data: observed });

      const current = await this.require(id);

      if (current.status === CbaWithdrawalStatus.PAYOUT_PENDING) {
        // Never paid: the locked money goes back.
        await this.restore(id, REASON.PAYOUT_FAILED);
      } else if (
        current.status === CbaWithdrawalStatus.PAID ||
        current.status === CbaWithdrawalStatus.SUCCEEDED
      ) {
        // Paid, then reversed by the bank. The money is back in the vault
        // but has already left the book. A person puts it right.
        await this.toReview(id, REASON.PAYOUT_REVERSED_AFTER_PAYMENT);
      }

      return;
    }

    // Still on its way.
    await this.prisma.cbaWithdrawal.update({ where: { withdrawalId: id }, data: observed });
  }

  // Takes the paid amount out of Pending Withdrawals in the CBA's books.
  // The money has left the vault; this makes the book agree.
  private async settle(withdrawalId: string): Promise<void> {
    const withdrawal = await this.require(withdrawalId);

    if (withdrawal.status !== CbaWithdrawalStatus.PAID) {
      return;
    }

    const pending = this.pendingEndpoint();

    // After an uncertain attempt, look before posting again.
    if (withdrawal.failureReason === REASON.SETTLEMENT_UNCERTAIN) {
      await this.settleByLookup(withdrawal, pending.accountId);
      return;
    }

    try {
      const posted = await this.witmango.withdraw({
        accountId: pending.accountId,
        amountNgn: withdrawal.amountNgn,
        transactionDate: this.today(),
        reference: withdrawal.settlementReference,
      });

      await this.move(withdrawalId, [CbaWithdrawalStatus.PAID], {
        status: CbaWithdrawalStatus.SUCCEEDED,
        settlementTransactionId: posted.transactionId,
        settledAt: new Date(),
        failureReason: null,
      });
    } catch (error) {
      if (error instanceof WitmangoUncertainOutcomeError) {
        await this.prisma.cbaWithdrawal.update({
          where: { withdrawalId },
          data: { failureReason: REASON.SETTLEMENT_UNCERTAIN },
        });

        await this.settleByLookup(
          { ...withdrawal, failureReason: REASON.SETTLEMENT_UNCERTAIN },
          pending.accountId,
        );
        return;
      }

      // A definite refusal: nothing was posted, so it is safe to try again
      // later. The customer has been paid regardless.
      this.logger.warn(
        `Withdrawal ${withdrawalId} paid but not settled: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );

      await this.prisma.cbaWithdrawal.update({
        where: { withdrawalId },
        data: { failureReason: REASON.SETTLEMENT_FAILED },
      });
    }
  }

  private async settleByLookup(
    withdrawal: CbaWithdrawal,
    pendingAccountId: number,
  ): Promise<void> {
    let found;

    try {
      found = await this.witmango.findTransactionByReference(
        pendingAccountId,
        withdrawal.settlementReference,
      );
    } catch {
      found = undefined;
    }

    if (
      found &&
      found.kind === 'WITHDRAWAL' &&
      !found.reversed &&
      found.amountNgn === withdrawal.amountNgn
    ) {
      await this.move(withdrawal.withdrawalId, [CbaWithdrawalStatus.PAID], {
        status: CbaWithdrawalStatus.SUCCEEDED,
        settlementTransactionId: found.transactionId,
        settledAt: new Date(),
        failureReason: null,
      });
    }

    // Not found is not treated as safe to post again: whether a reference
    // survives on a CBA withdrawal is UNVERIFIED. It stays PAID with
    // SETTLEMENT_UNCERTAIN, and blocks the rollout check, until resolved.
  }

  // Sends locked money back to the account it came from.
  private async restore(withdrawalId: string, reason: string): Promise<void> {
    const withdrawal = await this.prisma.cbaWithdrawal.findUnique({
      where: { withdrawalId },
      include: { lockTransfer: true },
    });

    if (!withdrawal?.lockTransfer) {
      return;
    }

    let restoreTransferId = withdrawal.restoreTransferId;

    if (!restoreTransferId) {
      if (!RESTORABLE.includes(withdrawal.status)) {
        return;
      }

      const lock = withdrawal.lockTransfer;

      restoreTransferId = await this.prisma.$transaction(async (tx) => {
        const restore = await this.cbaTransfers.createInTransaction(tx, {
          purpose: CbaTransferPurpose.WITHDRAWAL_RESTORE,
          walletId: withdrawal.walletId,
          from: {
            officeId: lock.toOfficeId,
            clientId: lock.toClientId,
            accountId: lock.toAccountId,
          },
          to: {
            officeId: lock.fromOfficeId,
            clientId: lock.fromClientId,
            accountId: lock.fromAccountId,
          },
          amountNgn: lock.amountNgn,
        });

        const claimed = await tx.cbaWithdrawal.updateMany({
          where: {
            withdrawalId,
            status: { in: RESTORABLE },
            restoreTransferId: null,
          },
          data: { restoreTransferId: restore.transferId, failureReason: reason },
        });

        if (claimed.count !== 1) {
          throw new ConflictException('Withdrawal is already being restored');
        }

        return restore.transferId;
      });
    }

    const sent = await this.cbaTransfers.execute(restoreTransferId);

    if (sent.status === CbaTransferStatus.POSTED) {
      await this.move(withdrawalId, RESTORABLE, {
        status: CbaWithdrawalStatus.RESTORED,
      });

      await this.writeAudit({ type: AuditActorType.SYSTEM, id: 'cba-withdrawals' }, withdrawalId, {
        severity: AuditSeverity.WARNING,
        action: 'CBA_WITHDRAWAL_RESTORED',
        metadata: { reason },
      });

      return;
    }

    await this.toReview(withdrawalId, REASON.RESTORE_NOT_POSTED);
  }

  // ─── helpers ──────────────────────────────────────────────

  // Moves a withdrawal only if it is still where the caller expects it.
  // Two callers — a webhook and a refresh, say — cannot both act on it.
  private async move(
    withdrawalId: string,
    from: CbaWithdrawalStatus[],
    data: Prisma.CbaWithdrawalUpdateManyMutationInput,
  ): Promise<boolean> {
    const result = await this.prisma.cbaWithdrawal.updateMany({
      where: { withdrawalId, status: { in: from } },
      data,
    });

    return result.count === 1;
  }

  private async toReview(withdrawalId: string, reason: string): Promise<void> {
    await this.prisma.cbaWithdrawal.update({
      where: { withdrawalId },
      data: { status: CbaWithdrawalStatus.REVIEW_REQUIRED, failureReason: reason },
    });

    await this.writeAudit({ type: AuditActorType.SYSTEM, id: 'cba-withdrawals' }, withdrawalId, {
      severity: AuditSeverity.CRITICAL,
      action: 'CBA_WITHDRAWAL_REVIEW_REQUIRED',
      metadata: { reason },
    });
  }

  private replay(
    existing: CbaWithdrawal,
    input: RequestWithdrawalInput,
  ): CbaWithdrawalView {
    if (
      existing.amountNgn !== input.amountNgn ||
      existing.withdrawalAccountId !== input.withdrawalAccountId
    ) {
      throw new ConflictException(
        'This request ID was already used for a different withdrawal',
      );
    }

    return this.toView(existing);
  }

  private limits(ownerType: LedgerOwnerType) {
    const agent = ownerType === LedgerOwnerType.AGENT;

    const perRequestNgn = this.number(
      agent
        ? 'WITHDRAWAL_MAX_PER_REQUEST_AGENT_NGN'
        : 'WITHDRAWAL_MAX_PER_REQUEST_CUSTOMER_NGN',
      0,
    );

    const dailyNgn = this.number(
      agent ? 'WITHDRAWAL_DAILY_MAX_AGENT_NGN' : 'WITHDRAWAL_DAILY_MAX_CUSTOMER_NGN',
      0,
    );

    // No limit is never assumed. Unset limits refuse withdrawals outright.
    if (perRequestNgn <= 0 || dailyNgn <= 0) {
      throw new ServiceUnavailableException(
        'Withdrawals are not available yet',
      );
    }

    const percent = this.number('WITHDRAWAL_MAX_PERCENT_OF_BALANCE', 100);

    return {
      minNgn: Math.max(1, this.number('WITHDRAWAL_MIN_NGN', 100)),
      perRequestNgn,
      dailyNgn,
      maxPercentOfBalance: percent >= 1 && percent <= 100 ? percent : 100,
      approvalThresholdNgn: Math.max(
        0,
        this.number('WITHDRAWAL_APPROVAL_THRESHOLD_NGN', 0),
      ),
    };
  }

  private pendingEndpoint(): WitmangoTransferEndpoint {
    return {
      officeId: this.positive('WITMANGO_OFFICE_ID'),
      clientId: this.positive('WITMANGO_PENDING_WITHDRAWALS_CLIENT_ID'),
      accountId: this.positive('WITMANGO_PENDING_WITHDRAWALS_ACCOUNT_ID'),
    };
  }

  private number(name: string, fallback: number): number {
    const value = Number(this.config.get(name) ?? fallback);

    return Number.isSafeInteger(value) ? value : fallback;
  }

  private positive(name: string): number {
    const value = Number(this.config.get(name));

    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ServiceUnavailableException(`${name} must be configured`);
    }

    return value;
  }

  private startOfWatDay(): Date {
    const wat = new Date(Date.now() + WAT_OFFSET_MS);
    wat.setUTCHours(0, 0, 0, 0);
    return new Date(wat.getTime() - WAT_OFFSET_MS);
  }

  private today(): string {
    return new Date(Date.now() + WAT_OFFSET_MS).toISOString().slice(0, 10);
  }

  private async require(withdrawalId: string): Promise<CbaWithdrawal> {
    const withdrawal = await this.prisma.cbaWithdrawal.findUnique({
      where: { withdrawalId },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    return withdrawal;
  }

  private async view(withdrawalId: string): Promise<CbaWithdrawalView> {
    return this.toView(await this.require(withdrawalId));
  }

  private toView(row: CbaWithdrawal): CbaWithdrawalView {
    return {
      withdrawalId: row.withdrawalId,
      status: row.status,
      amountNgn: row.amountNgn,
      bankCode: row.bankCode,
      accountLast4: row.accountLast4,
      requiresApproval: row.requiresApproval,
      failureReason: row.failureReason,
      createdAt: row.createdAt.toISOString(),
      paidAt: row.payoutCompletedAt?.toISOString() ?? null,
    };
  }

  private async writeAudit(
    actor: { type: AuditActorType; id: string },
    withdrawalId: string,
    entry: {
      severity: AuditSeverity;
      action: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await this.audit
      .write({
        severity: entry.severity,
        actor,
        action: entry.action,
        resource: { type: 'CbaWithdrawal', id: withdrawalId },
        metadata: entry.metadata,
      })
      .catch((error) => {
        this.logger.error(
          `Audit failed for withdrawal ${withdrawalId}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      });
  }
}
