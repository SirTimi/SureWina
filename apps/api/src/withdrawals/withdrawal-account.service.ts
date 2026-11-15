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
  LedgerOwnerType,
  WithdrawalAccount,
  WithdrawalAccountStatus,
} from '@prisma/client';

import { createHash, createHmac, timingSafeEqual } from 'crypto';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MonnifyVerificationService } from '../integrations/monnify/monnify-verification.service';
import { PayoutAccountCipherService } from '../payout-accounts/payout-account-cipher.service';

// Who is asking: the wallet, and the owner it belongs to.
export type WalletOwner = {
  walletId: string;
  ownerType: LedgerOwnerType;
  // userId for a customer, agentId for an agent.
  ownerId: string;
  actor: { type: AuditActorType; id: string };
};

export type AddWithdrawalAccountInput = {
  bankCode: string;
  accountNumber: string;
  bvn: string;
  bankName?: string;
};

// A saved account as its owner sees it. Never the full account number.
export type WithdrawalAccountView = {
  withdrawalAccountId: string;
  bankCode: string;
  bankName: string | null;
  accountLast4: string;
  accountName: string | null;
  status: WithdrawalAccountStatus;
  usableFrom: string | null;
  usable: boolean;
  createdAt: string;
};

// The destination a withdrawal is paid to, decrypted only at that moment.
export type WithdrawalDestination = {
  withdrawalAccountId: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  accountLast4: string;
  accountFingerprint: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Saved withdrawal accounts for customers and agents.
//
// An account is saved only if it is in the owner's own name, proven two
// ways before anything is stored:
//
//   1. The BVN the owner types must be the BVN their wallet was verified
//      with. SureWina never stores a BVN — only a fingerprint (customers) or
//      hash (agents) — so it is checked against that, and goes no further
//      if it differs. A wrong BVN costs nothing.
//   2. Monnify must confirm the bank account belongs to that BVN.
//
// A saved account cannot be used until its cooling-off period ends.
@Injectable()
export class WithdrawalAccountService {
  private readonly logger = new Logger(WithdrawalAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly verification: MonnifyVerificationService,
    private readonly cipher: PayoutAccountCipherService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('WITHDRAWAL_ACCOUNTS_ENABLED') === true;
  }

  async list(owner: WalletOwner): Promise<WithdrawalAccountView[]> {
    const accounts = await this.prisma.withdrawalAccount.findMany({
      where: {
        walletId: owner.walletId,
        status: WithdrawalAccountStatus.ACTIVE,
      },
      orderBy: { createdAt: 'asc' },
    });

    return accounts.map((account) => this.toView(account));
  }

  async add(
    owner: WalletOwner,
    input: AddWithdrawalAccountInput,
  ): Promise<WithdrawalAccountView> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Saving withdrawal accounts is not available yet',
      );
    }

    const bankCode = input.bankCode?.trim();
    const accountNumber = input.accountNumber?.trim();
    const bvn = input.bvn?.trim();

    if (!/^\d{3,6}$/.test(bankCode ?? '')) {
      throw new BadRequestException('Invalid bank code');
    }

    if (!/^\d{10}$/.test(accountNumber ?? '')) {
      throw new BadRequestException(
        'Bank account number must contain exactly 10 digits',
      );
    }

    if (!/^\d{11}$/.test(bvn ?? '')) {
      throw new BadRequestException('A BVN must be exactly 11 digits');
    }

    const fingerprint = this.accountFingerprint(bankCode, accountNumber);

    const [active, recentAttempts, duplicate] = await Promise.all([
      this.prisma.withdrawalAccount.count({
        where: {
          walletId: owner.walletId,
          status: WithdrawalAccountStatus.ACTIVE,
        },
      }),
      this.prisma.withdrawalAccount.count({
        where: {
          walletId: owner.walletId,
          createdAt: { gte: new Date(Date.now() - DAY_MS) },
        },
      }),
      this.prisma.withdrawalAccount.findFirst({
        where: {
          walletId: owner.walletId,
          accountFingerprint: fingerprint,
          status: WithdrawalAccountStatus.ACTIVE,
        },
      }),
    ]);

    if (duplicate) {
      throw new ConflictException('This account is already saved');
    }

    if (active >= this.positive('WITHDRAWAL_ACCOUNTS_MAX', 3)) {
      throw new ConflictException(
        'You have saved the maximum number of withdrawal accounts. Remove one to add another.',
      );
    }

    if (recentAttempts >= this.positive('WITHDRAWAL_ACCOUNT_ADDS_PER_DAY', 3)) {
      throw new ConflictException(
        'Too many accounts added today. Try again tomorrow.',
      );
    }

    // 1. The BVN must be the owner's own. Nothing is sent to Monnify and
    //    nothing is stored if it is not.
    if (!(await this.isOwnersBvn(owner, bvn))) {
      await this.writeAudit(owner, 'WITHDRAWAL_ACCOUNT_BVN_MISMATCH', {
        severity: AuditSeverity.WARNING,
        bankCode,
        accountLast4: accountNumber.slice(-4),
      });

      throw new ConflictException(
        'That BVN does not match the one your wallet was verified with',
      );
    }

    // 2. The account must belong to that BVN.
    let match;

    try {
      match = await this.verification.matchBvnToAccount({
        bvn,
        bankCode,
        accountNumber,
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'We cannot verify bank accounts right now. Please try again shortly.',
      );
    }

    const ciphertext = this.cipher.encrypt(
      owner.walletId,
      bankCode,
      accountNumber,
    );

    const now = new Date();

    if (match.outcome !== 'MATCHED') {
      // Kept as a record: it counts towards the daily limit, and repeated
      // attempts to add someone else's account are worth seeing.
      await this.prisma.withdrawalAccount.create({
        data: {
          walletId: owner.walletId,
          ownerType: owner.ownerType,
          bankCode,
          bankName: this.cleanBankName(input.bankName),
          accountCiphertext: ciphertext,
          accountLast4: accountNumber.slice(-4),
          accountFingerprint: fingerprint,
          status: WithdrawalAccountStatus.REJECTED,
        },
      });

      await this.writeAudit(owner, 'WITHDRAWAL_ACCOUNT_REJECTED', {
        severity: AuditSeverity.WARNING,
        bankCode,
        accountLast4: accountNumber.slice(-4),
      });

      throw new ConflictException(
        'This account is not in your name. You can only withdraw to an account that matches your BVN.',
      );
    }

    const usableFrom = new Date(
      now.getTime() + this.coolingOffHours() * 60 * 60 * 1000,
    );

    const saved = await this.prisma.withdrawalAccount.create({
      data: {
        walletId: owner.walletId,
        ownerType: owner.ownerType,
        bankCode,
        bankName: this.cleanBankName(input.bankName),
        accountCiphertext: ciphertext,
        accountLast4: accountNumber.slice(-4),
        accountFingerprint: fingerprint,
        accountName: match.accountName.slice(0, 200),
        status: WithdrawalAccountStatus.ACTIVE,
        verifiedAt: now,
        usableFrom,
      },
    });

    await this.writeAudit(owner, 'WITHDRAWAL_ACCOUNT_SAVED', {
      severity: AuditSeverity.INFO,
      withdrawalAccountId: saved.withdrawalAccountId,
      bankCode,
      accountLast4: saved.accountLast4,
      usableFrom: usableFrom.toISOString(),
    });

    return this.toView(saved);
  }

  async remove(
    owner: WalletOwner,
    withdrawalAccountId: string,
  ): Promise<{ removed: true }> {
    const result = await this.prisma.withdrawalAccount.updateMany({
      where: {
        withdrawalAccountId,
        walletId: owner.walletId,
        status: WithdrawalAccountStatus.ACTIVE,
      },
      data: {
        status: WithdrawalAccountStatus.REMOVED,
        removedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new NotFoundException('Withdrawal account not found');
    }

    await this.writeAudit(owner, 'WITHDRAWAL_ACCOUNT_REMOVED', {
      severity: AuditSeverity.INFO,
      withdrawalAccountId,
    });

    return { removed: true };
  }

  // For the withdrawal itself: the saved account, decrypted, if — and only
  // if — it belongs to this wallet, is active, and is out of cooling-off.
  async requireUsable(
    walletId: string,
    withdrawalAccountId: string,
  ): Promise<WithdrawalDestination> {
    const account = await this.prisma.withdrawalAccount.findFirst({
      where: { withdrawalAccountId, walletId },
    });

    if (!account || account.status !== WithdrawalAccountStatus.ACTIVE) {
      throw new NotFoundException('Withdrawal account not found');
    }

    if (!this.isUsable(account)) {
      throw new ConflictException(
        `This account can be used from ${account.usableFrom?.toISOString() ?? 'later'}. New accounts have a waiting period for your security.`,
      );
    }

    if (!account.accountName) {
      throw new ConflictException('This account has not been verified');
    }

    const accountNumber = this.cipher.decrypt(
      walletId,
      account.bankCode,
      account.accountCiphertext,
    );

    // The stored fingerprint must still describe the decrypted account. If
    // it does not, the row has been tampered with.
    if (
      this.accountFingerprint(account.bankCode, accountNumber) !==
      account.accountFingerprint
    ) {
      throw new ConflictException('Withdrawal account failed verification');
    }

    return {
      withdrawalAccountId: account.withdrawalAccountId,
      bankCode: account.bankCode,
      accountNumber,
      accountName: account.accountName,
      accountLast4: account.accountLast4,
      accountFingerprint: account.accountFingerprint,
    };
  }

  // Same formula as the prize payout records, so the same bank account has
  // the same fingerprint everywhere on the platform.
  accountFingerprint(bankCode: string, accountNumber: string): string {
    return createHmac('sha256', this.fingerprintKey())
      .update(`surewina:bank:v1:${bankCode}:${accountNumber}`)
      .digest('hex');
  }

  private async isOwnersBvn(owner: WalletOwner, bvn: string): Promise<boolean> {
    if (owner.ownerType === LedgerOwnerType.CUSTOMER) {
      const identity = await this.prisma.verifiedIdentity.findUnique({
        where: { userId: owner.ownerId },
        select: { identityFingerprint: true },
      });

      if (!identity) {
        throw new ConflictException(
          'Verify your identity before saving a withdrawal account',
        );
      }

      const expected = createHmac('sha256', this.fingerprintKey())
        .update(`surewina:identity:v1:BVN:${bvn}`)
        .digest('hex');

      return this.sameHex(expected, identity.identityFingerprint);
    }

    if (owner.ownerType === LedgerOwnerType.AGENT) {
      const agent = await this.prisma.agent.findUnique({
        where: { agentId: owner.ownerId },
        select: { bvnHash: true },
      });

      if (!agent?.bvnHash) {
        throw new ConflictException(
          'Your BVN is not on record. Contact SureWina support.',
        );
      }

      // Agents' BVNs are recorded at onboarding as a plain SHA-256.
      return this.sameHex(
        createHash('sha256').update(bvn).digest('hex'),
        agent.bvnHash,
      );
    }

    throw new ConflictException('This wallet cannot save withdrawal accounts');
  }

  private sameHex(a: string, b: string): boolean {
    const left = Buffer.from(a.toLowerCase(), 'utf8');
    const right = Buffer.from(b.toLowerCase(), 'utf8');

    return left.length === right.length && timingSafeEqual(left, right);
  }

  private isUsable(account: WithdrawalAccount): boolean {
    return (
      account.status === WithdrawalAccountStatus.ACTIVE &&
      !!account.usableFrom &&
      account.usableFrom.getTime() <= Date.now()
    );
  }

  private toView(account: WithdrawalAccount): WithdrawalAccountView {
    return {
      withdrawalAccountId: account.withdrawalAccountId,
      bankCode: account.bankCode,
      bankName: account.bankName,
      accountLast4: account.accountLast4,
      accountName: account.accountName,
      status: account.status,
      usableFrom: account.usableFrom?.toISOString() ?? null,
      usable: this.isUsable(account),
      createdAt: account.createdAt.toISOString(),
    };
  }

  private cleanBankName(value?: string): string | null {
    const name = value?.trim().replace(/\s+/g, ' ');

    return name ? name.slice(0, 140) : null;
  }

  private coolingOffHours(): number {
    const value = Number(
      this.config.get('WITHDRAWAL_ACCOUNT_COOLING_OFF_HOURS') ?? 24,
    );

    return Number.isFinite(value) && value >= 0 ? value : 24;
  }

  private positive(name: string, fallback: number): number {
    const value = Number(this.config.get(name) ?? fallback);

    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }

  private fingerprintKey(): string {
    const key = this.config.get<string>('KYC_BANK_FINGERPRINT_KEY')?.trim();

    if (!key || key.length < 32) {
      throw new ServiceUnavailableException(
        'Account fingerprinting is not configured',
      );
    }

    return key;
  }

  private async writeAudit(
    owner: WalletOwner,
    action: string,
    metadata: Record<string, unknown> & { severity: AuditSeverity },
  ) {
    const { severity, ...rest } = metadata;

    await this.audit
      .write({
        severity,
        actor: owner.actor,
        action,
        resource: { type: 'Wallet', id: owner.walletId },
        metadata: rest,
      })
      .catch((error) => {
        this.logger.error(
          `Audit failed for ${action}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      });
  }
}
