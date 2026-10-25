
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  AuditActorType,
  AuditSeverity,
  KycIdentityCheckStatus,
  LedgerOwnerType,
  Prisma,
  VerifiedPayoutAccountStatus,
  WalletStatus,
  WalletWithdrawalStatus,
  WitmangoWalletLinkStatus,
} from '@prisma/client';

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../../wallet/wallet.service';
import { AuditService } from '../../audit/audit.service';
import { WitmangoClientService } from './witmango-client.service';

import { PayoutAccountCipherService } from '../../payout-accounts/payout-account-cipher.service';
import { KycIdentityEvidenceService } from '../../claims/kyc/kyc-identity-evidence.service';

@Injectable()
export class WitmangoWithdrawalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletService,
    private readonly witmango: WitmangoClientService,
    private readonly cipher: PayoutAccountCipherService,
    private readonly evidence: KycIdentityEvidenceService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private assertReservationsEnabled(): void {
    if (
      !this.witmango.isEnabled() ||
      this.config.get<boolean>(
        'WITMANGO_WITHDRAWAL_RESERVATIONS_ENABLED',
      ) !== true
    ) {
      throw new ServiceUnavailableException(
        'CBA withdrawal reservations are disabled',
      );
    }
  }

  private tenantId(): string {
    const tenant = this.config
      .get<string>('WITMANGO_TENANT_ID')
      ?.trim();

    if (!tenant) {
      throw new ServiceUnavailableException(
        'Witmango tenant is not configured',
      );
    }

    return tenant;
  }

  private toKobo(value: number): number {
    const kobo = Math.round(value * 100);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      !Number.isSafeInteger(kobo) ||
      Math.abs(value * 100 - kobo) > 0.000001
    ) {
      throw new ConflictException(
        'CBA balance precision is invalid',
      );
    }

    return kobo;
  }

  private view(row: {
    withdrawalId: string;
    amountNgn: number;
    status: WalletWithdrawalStatus;
    bankCode: string;
    bankAccountLast4: string;
    createdAt: Date;
    resolvedAt: Date | null;
  }) {
    return {
      withdrawalId: row.withdrawalId,
      amountNgn: row.amountNgn,
      currency: 'NGN',
      status: row.status,
      destination: {
        bankCode: row.bankCode,
        accountLast4: row.bankAccountLast4,
      },
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    };
  }

  async getMine(userId: string, withdrawalId: string) {
    const row = await this.prisma.walletWithdrawal.findFirst({
      where: { withdrawalId, userId },
    });

    if (!row) {
      throw new NotFoundException('Withdrawal not found');
    }

    return this.view(row);
  }

  async listMine(userId: string) {
    const rows = await this.prisma.walletWithdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      withdrawals: rows.map((row) => this.view(row)),
    };
  }

  async reserve(
    userId: string,
    requestId: string,
    amountNgn: number,
  ) {
    this.assertReservationsEnabled();

    if (
      !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requestId) ||
      !Number.isSafeInteger(amountNgn) ||
      amountNgn < 100 ||
      amountNgn > 500000
    ) {
      throw new BadRequestException(
        'Invalid withdrawal reference or amount',
      );
    }

    // Exact request replay is safe.
    const existing = await this.prisma.walletWithdrawal.findUnique({
      where: {
        userId_requestId: { userId, requestId },
      },
    });

    if (existing) {
      if (existing.amountNgn !== amountNgn) {
        throw new ConflictException(
          'Withdrawal reference reused with another amount',
        );
      }

      return this.view(existing);
    }

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        phoneNumber: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const internal = await this.wallets.getCustomerWallet(userId);

    if (
      internal.ownerType !== LedgerOwnerType.CUSTOMER ||
      internal.ownerId !== userId ||
      internal.currency !== 'NGN' ||
      internal.status !== WalletStatus.ACTIVE
    ) {
      throw new ConflictException(
        'Customer wallet is not active',
      );
    }

    const link = await this.prisma.witmangoWalletLink.findUnique({
      where: { walletId: internal.walletId },
    });

    if (
      !link ||
      link.status !== WitmangoWalletLinkStatus.ACTIVE ||
      link.tenantId !== this.tenantId() ||
      !link.savingsAccountId
    ) {
      throw new ConflictException(
        'Customer CBA wallet is not ready',
      );
    }

    const savingsAccountId: number = link.savingsAccountId

    // Read-only preflight. No CBA debit is made.
    const external = await this.witmango.getSavingsAccount(
      link.savingsAccountId,
    );

    if (external.status.id !== 300) {
      throw new ConflictException(
        'CBA savings account is not active',
      );
    }

    // Before the hold is created, balances must agree.
    // Otherwise we do not know which funds are available.
    const internalTotalKobo = internal.totalNgn * 100;
    const internalAvailableKobo = internal.availableNgn * 100;

    if (
      !Number.isSafeInteger(internalTotalKobo) ||
      !Number.isSafeInteger(internalAvailableKobo) ||
      this.toKobo(external.summary.accountBalance) !== internalTotalKobo ||
      this.toKobo(external.summary.availableBalance) !== internalAvailableKobo ||
      internalAvailableKobo < amountNgn * 100
    ) {
      throw new ConflictException(
        'Wallet balances require reconciliation before withdrawal',
      );
    }

    // All local reservation changes are one transaction.
    const created = await this.prisma.$transaction(
      async (tx) => {

        await tx.$queryRaw`
            SELECT "user_id"
            FROM "users"
            WHERE "user_id" = ${userId}
            FOR UPDATE
        `
        // Serialize with other wallet-changing operations.
        await tx.$queryRaw`
          SELECT "wallet_id"
          FROM "wallets"
          WHERE "wallet_id" = ${internal.walletId}
          FOR UPDATE
        `;

        // Check again after taking the lock.
        const duplicate = await tx.walletWithdrawal.findUnique({
          where: {
            userId_requestId: { userId, requestId },
          },
        });

        if (duplicate) {
          if (duplicate.amountNgn !== amountNgn) {
            throw new ConflictException(
              'Withdrawal reference reused with another amount',
            );
          }

          return duplicate;
        }

        // One unfinished withdrawal per wallet.
        const active = await tx.walletWithdrawal.findFirst({
          where: {
            walletId: internal.walletId,
            status: {
              in: [
                WalletWithdrawalStatus.RESERVED,
                WalletWithdrawalStatus.CBA_DEBIT_UNKNOWN,
                WalletWithdrawalStatus.CBA_DEBIT_CONFIRMED,
                WalletWithdrawalStatus.BANK_TRANSFER_PENDING,
                WalletWithdrawalStatus.BANK_TRANSFER_UNKNOWN,
                WalletWithdrawalStatus.RESTORE_REQUIRED,
                WalletWithdrawalStatus.REVIEW_REQUIRED,
              ],
            },
          },
        });

        if (active) {
          throw new ConflictException(
            'Another withdrawal is awaiting completion or reconciliation',
          );
        }

        const account = await tx.verifiedPayoutAccount.findFirst({
          where: {
            userId,
            status: VerifiedPayoutAccountStatus.LOCKED,
            verifiedAt: { not: null },
            lockedAt: { not: null },
            revokedAt: null,
          },
          include: {
            identityCheck: {
              include: {
                claim: {
                  select: {
                    winnerPhone: true,
                    winnerUserId: true,
                  },
                },
              },
            },
          },
        });

        if (!account || account.currency !== 'NGN') {
          throw new ConflictException(
            'An approved locked bank account is required',
          );
        }

        const check = account.identityCheck;

        if (
          !check ||
          check.provider !== 'PAYSTACK' ||
          check.status !== KycIdentityCheckStatus.VERIFIED ||
          !check.verifiedAt ||
          !check.paystackCustomerCode ||
          check.claim.winnerPhone !== user.phoneNumber ||
          (
            check.claim.winnerUserId &&
            check.claim.winnerUserId !== userId
          ) ||
          check.bankCode !== account.bankCode ||
          check.bankAccountLast4 !== account.accountLast4 ||
          check.bankAccountFingerprint !== account.accountFingerprint
        ) {
          throw new ConflictException(
            'Bank beneficiary verification is not valid',
          );
        }

        const accountNumber = this.cipher.decrypt(
          userId,
          account.bankCode,
          account.accountCiphertext,
        );

        this.evidence.assertDestinationMatches(
          check,
          account.bankCode,
          accountNumber,
        );

        if (accountNumber.slice(-4) !== account.accountLast4) {
          throw new ConflictException(
            'Bank beneficiary metadata mismatch',
          );
        }

        const withdrawalId = randomUUID();

        // This protects SureWina's internal spendable balance.
        // It is NOT a Fineract hold and must not be treated
        // as one.
        const hold = await this.wallets.createHoldInTransaction(
          tx,
          {
            walletId: internal.walletId,
            amountNgn,
            idempotencyKey: `wallet-withdrawal:hold:${withdrawalId}`,
            referenceType: 'WalletWithdrawal',
            referenceId: withdrawalId,
            description: 'Reserve customer bank withdrawal',
          },
        );

        return tx.walletWithdrawal.create({
          data: {
            withdrawalId,
            userId,
            walletId: internal.walletId,
            payoutAccountId: account.payoutAccountId,
            holdId: hold.holdId,
            requestId,

            tenantId: link.tenantId,
            savingsAccountId,

            amountNgn,
            currency: 'NGN',

            bankCode: account.bankCode,
            bankAccountLast4: account.accountLast4,
            bankFingerprint: account.accountFingerprint,
            bankCiphertext: this.cipher.encrypt(
              userId,
              account.bankCode,
              accountNumber,
            ),

            // These are generated once and never changed.
            cbaReference: `sw-cba-${withdrawalId}`,
            paystackReference: `sw-bank-${withdrawalId}`,

            status: WalletWithdrawalStatus.RESERVED,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: {
        type: AuditActorType.CUSTOMER,
        id: userId,
      },
      action: 'WALLET_WITHDRAWAL_RESERVED',
      resource: {
        type: 'WalletWithdrawal',
        id: created.withdrawalId,
      },
      metadata: {
        walletId: created.walletId,
        amountNgn: created.amountNgn,
        accountLast4: created.bankAccountLast4,
        status: created.status,
      },
    });

    return this.view(created);
  }

  async cancelUnsubmitted(userId: string, withdrawalId: string) {
    // Do not release a local hold after any external submission.
    // The setting prevents this endpoint from bypassing financial
    // restoration when monetary operations are activated.
    if (
      this.config.get<boolean>('WITMANGO_MONETARY_ENABLED') === true
    ) {
      throw new ConflictException(
        'Withdrawal cancellation requires financial reconciliation',
      );
    }

    const locator = await this.prisma.walletWithdrawal.findFirst({
      where: { withdrawalId, userId },
      select: { walletId: true },
    });

    if (!locator) {
      throw new NotFoundException('Withdrawal not found');
    }

    const updated = await this.prisma.$transaction(
      async (tx) => {
        // Follow the same user -> wallet lock order as reservation
        // and beneficiary replacement. The withdrawal row is then
        // locked so cancellation cannot race a future CBA worker.
        await tx.$queryRaw`
          SELECT "user_id"
          FROM "users"
          WHERE "user_id" = ${userId}
          FOR UPDATE
        `;

        await tx.$queryRaw`
          SELECT "wallet_id"
          FROM "wallets"
          WHERE "wallet_id" = ${locator.walletId}
          FOR UPDATE
        `;

        await tx.$queryRaw`
          SELECT "withdrawal_id"
          FROM "wallet_withdrawals"
          WHERE "withdrawal_id" = ${withdrawalId}
          FOR UPDATE
        `;

        const row = await tx.walletWithdrawal.findUnique({
          where: { withdrawalId },
        });

        if (
          !row ||
          row.userId !== userId ||
          row.walletId !== locator.walletId
        ) {
          throw new NotFoundException('Withdrawal not found');
        }

        if (row.status === WalletWithdrawalStatus.CANCELLED) {
          return row;
        }

        if (
          row.status !== WalletWithdrawalStatus.RESERVED ||
          row.cbaTransactionId ||
          row.paystackTransactionId ||
          row.cbaSubmissionStartedAt ||
          row.paystackSubmissionStartedAt
        ) {
          throw new ConflictException(
            'Withdrawal is not safe to cancel automatically',
          );
        }

        // All three mutations are atomic: ledger journal, wallet hold,
        // and withdrawal status. A failed update rolls back the release.
        await this.wallets.releaseHoldInTransaction(tx, {
          holdId: row.holdId,
          idempotencyKey:
            `wallet-withdrawal:release:${withdrawalId}`,
          description: 'Cancel unsubmitted bank withdrawal',
        });

        return tx.walletWithdrawal.update({
          where: { withdrawalId },
          data: {
            status: WalletWithdrawalStatus.CANCELLED,
            resolvedAt: new Date(),
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return this.view(updated);
  }

  async financeInspect(withdrawalId: string) {
    const row = await this.prisma.walletWithdrawal.findUnique({
      where: { withdrawalId },
    });

    if (!row) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (row.tenantId !== this.tenantId()) {
      throw new ConflictException(
        'Withdrawal belongs to a different CBA tenant',
      );
    }

    // Both checks are read-only. They do not resolve
    // a payout or restore any funds.
    const external = await this.witmango.getSavingsAccount(
      row.savingsAccountId,
    );

    const hold = await this.prisma.walletHold.findUnique({
      where: { holdId: row.holdId },
      select: {
        status: true,
        amountNgn: true,
      },
    });

    return {
      ...this.view(row),
      cba: {
        reference: row.cbaReference,
        transactionId: row.cbaTransactionId,
        savingsAccountId: row.savingsAccountId,
        currency: external.currency.code,
        accountActive: external.status.id === 300,
        availableNgn: external.summary.availableBalance,
        totalNgn: external.summary.accountBalance,
      },
      hold: hold
        ? {
            status: hold.status,
            amountNgn: hold.amountNgn,
          }
        : null,
      paystack: {
        reference: row.paystackReference,
        transactionId: row.paystackTransactionId,
      },
      reconciliationRequired:
        row.status !== WalletWithdrawalStatus.CANCELLED &&
        row.status !== WalletWithdrawalStatus.SUCCEEDED,
    };
  }
}
