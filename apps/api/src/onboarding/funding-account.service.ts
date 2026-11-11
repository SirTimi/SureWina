import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuditActorType,
  AuditSeverity,
  Prisma,
  ReservedAccountStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IdentityVerificationService } from '../identity/identity-verification.service';
import { MonnifyReservedAccountsService } from '../integrations/monnify/monnify-reserved-accounts.service';
import { WitmangoWalletLinkService } from '../integrations/witmango/witmango-wallet-link.service';

export type FundingAccountStatus =
  | 'NOT_STARTED'
  | 'READY'
  | 'BEING_SET_UP'
  | 'NOT_AVAILABLE';

export type FundingBankAccount = {
  bankName: string;
  accountNumber: string;
  accountName: string;
};

export type FundingAccountView = {
  status: FundingAccountStatus;
  // The account numbers to transfer into. Empty unless status is READY.
  accounts: FundingBankAccount[];
};

const NONE: FundingAccountView = { status: 'NOT_STARTED', accounts: [] };

// The account number a customer transfers into to fund their wallet.
//
// Issued last, and only once the wallet's CBA accounts are ready. An account
// number with no book account behind it is the worst state this system can
// reach: real money arrives with nowhere to be recorded.
@Injectable()
export class FundingAccountService {
  private readonly logger = new Logger(FundingAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly monnify: MonnifyReservedAccountsService,
    private readonly identity: IdentityVerificationService,
    private readonly links: WitmangoWalletLinkService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async getView(walletId: string): Promise<FundingAccountView> {
    const row = await this.prisma.walletReservedAccount.findUnique({
      where: { walletId },
    });

    if (!row) {
      return NONE;
    }

    if (row.status !== ReservedAccountStatus.ACTIVE) {
      return { status: 'BEING_SET_UP', accounts: [] };
    }

    return {
      status: 'READY',
      accounts: this.readAccounts(row.accounts, row.customerName),
    };
  }

  // Makes sure a customer has a funding account, creating one if needed.
  //
  // Safe to call on every onboarding request. Monnify refuses a second
  // reservation under the same reference and lets an existing one be looked
  // up, so an attempt that failed or went unanswered is simply tried again.
  //
  // The BVN is required by Monnify and is not stored here either. It must
  // be the one the customer verified with.
  async ensureForCustomer(input: {
    userId: string;
    walletId: string;
    bvn: string;
  }): Promise<FundingAccountView> {
    const { userId, walletId } = input;

    if (!this.monnify.isEnabled()) {
      return { status: 'NOT_AVAILABLE', accounts: [] };
    }

    // No limits, no account. An account without them would defeat the
    // deposit caps the limits exist to enforce.
    const limitProfileCode = this.config
      .get<string>('MONNIFY_CUSTOMER_LIMIT_PROFILE_CODE')
      ?.trim();

    if (!limitProfileCode) {
      this.logger.error(
        'MONNIFY_CUSTOMER_LIMIT_PROFILE_CODE is not set — funding accounts cannot be issued',
      );

      return { status: 'NOT_AVAILABLE', accounts: [] };
    }

    if ((await this.links.getState(walletId)) !== 'READY') {
      throw new ConflictException(
        'Wallet accounts must be ready before a funding account is issued',
      );
    }

    const identity = await this.identity.requireVerifiedBvn(
      userId,
      input.bvn,
    );

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, phoneNumber: true },
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const customerName = `${identity.firstName} ${identity.lastName}`;
    const accountReference = `SW-WAL-${walletId}`;

    let row = await this.prisma.walletReservedAccount.findUnique({
      where: { walletId },
    });

    if (!row) {
      try {
        row = await this.prisma.walletReservedAccount.create({
          data: {
            walletId,
            accountReference,
            customerName,
            limitProfileCode,
            status: ReservedAccountStatus.PROVISIONING,
          },
        });
      } catch (error) {
        // A simultaneous request created it first. Carry on with theirs.
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }

        row = await this.prisma.walletReservedAccount.findUnique({
          where: { walletId },
        });
      }
    }

    if (!row || row.status === ReservedAccountStatus.REVIEW_REQUIRED) {
      return { status: 'BEING_SET_UP', accounts: [] };
    }

    if (row.status === ReservedAccountStatus.ACTIVE) {
      return {
        status: 'READY',
        accounts: this.readAccounts(row.accounts, row.customerName),
      };
    }

    try {
      const result = await this.monnify.reserve({
        accountReference: row.accountReference,
        accountName: row.customerName,
        customerName: row.customerName,
        customerEmail: user.email ?? this.placeholderEmail(user.phoneNumber),
        bvn: input.bvn.trim(),
        limitProfileCode: row.limitProfileCode,
      });

      const reservation =
        result.outcome === 'RESERVED'
          ? result
          : await this.monnify.find(row.accountReference);

      if (!reservation) {
        // Monnify said the reference is taken, then could not find it. That
        // contradiction needs a person, not another attempt.
        await this.prisma.walletReservedAccount.update({
          where: { walletId },
          data: { status: ReservedAccountStatus.REVIEW_REQUIRED },
        });

        return { status: 'BEING_SET_UP', accounts: [] };
      }

      await this.prisma.walletReservedAccount.update({
        where: { walletId },
        data: {
          status: ReservedAccountStatus.ACTIVE,
          reservationReference: reservation.reservationReference,
          accounts: reservation.accounts,
        },
      });

      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: { type: AuditActorType.CUSTOMER, id: userId },
        action: 'FUNDING_ACCOUNT_RESERVED',
        resource: { type: 'Wallet', id: walletId },
        metadata: {
          accountReference: row.accountReference,
          reservationReference: reservation.reservationReference,
          limitProfileCode: row.limitProfileCode,
          banks: reservation.accounts.map((account) => account.bankName),
        },
      });

      return {
        status: 'READY',
        accounts: reservation.accounts.map((account) => ({
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          accountName: row!.customerName,
        })),
      };
    } catch (error) {
      // Left as PROVISIONING on purpose: the next request tries again, and
      // Monnify's duplicate check makes that safe.
      this.logger.warn(
        `Funding account not reserved for wallet ${walletId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );

      return { status: 'BEING_SET_UP', accounts: [] };
    }
  }

  // Stored as JSON, so it is validated on the way out rather than trusted.
  private readAccounts(
    value: unknown,
    accountName: string,
  ): FundingBankAccount[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry): FundingBankAccount[] => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as Record<string, unknown>).bankName !== 'string' ||
        !/^\d{10}$/.test(
          String((entry as Record<string, unknown>).accountNumber ?? ''),
        )
      ) {
        return [];
      }

      const account = entry as { bankName: string; accountNumber: string };

      return [
        {
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          accountName,
        },
      ];
    });
  }

  // Monnify requires an email for every reservation. Customers who signed
  // up with a phone number only get the same placeholder the payment flow
  // already uses. It goes to Monnify alone — never to the CBA.
  private placeholderEmail(phoneNumber: string): string {
    return `${phoneNumber.replace(/\D/g, '')}@buyers.surewina.ng`;
  }
}