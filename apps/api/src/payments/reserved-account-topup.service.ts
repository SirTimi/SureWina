import {
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
  PaymentGateway,
  Prisma,
  ReservedAccountStatus,
  WalletFundingStatus,
  WitmangoWalletPurpose,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  WitmangoClientService,
  WitmangoUncertainOutcomeError,
} from '../integrations/witmango/witmango-client.service';
import { WitmangoWalletLinkService } from '../integrations/witmango/witmango-wallet-link.service';

import { PaymentVerificationService } from './payment-verification.service';

// What Monnify sends when a transfer lands in a reserved account. Nothing in
// it is trusted beyond identifying which payment to go and verify.
export type MonnifyReservedAccountEvent = {
  eventType?: string;
  eventData?: {
    paymentReference?: string;
    transactionReference?: string;
    amountPaid?: number | string;
    product?: { type?: string; reference?: string };
  };
};

// Why a top-up is not credited. Kept as stable codes: finance filters on
// them, and reprocess() decides what may be retried by them.
const REASON = {
  VERIFICATION_UNAVAILABLE: 'VERIFICATION_UNAVAILABLE',
  NOT_PAID: 'NOT_PAID',
  AMOUNT_UNUSABLE: 'AMOUNT_UNUSABLE',
  DESTINATION_UNCONFIRMED: 'DESTINATION_UNCONFIRMED',
  OVER_LIMIT: 'OVER_LIMIT',
  CBA_ACCOUNT_NOT_READY: 'CBA_ACCOUNT_NOT_READY',
  CBA_UNAVAILABLE: 'CBA_UNAVAILABLE',
  CBA_REJECTED: 'CBA_REJECTED',
  CBA_OUTCOME_UNCERTAIN: 'CBA_OUTCOME_UNCERTAIN',
} as const;

// The wallet a deposit lands in. Money a customer sends is spendable but not
// withdrawable, so it goes to Deposit — never Winnings. Same for an agent's
// Float and Earnings.
const CREDIT_PURPOSE: Partial<Record<LedgerOwnerType, WitmangoWalletPurpose>> = {
  [LedgerOwnerType.CUSTOMER]: WitmangoWalletPurpose.DEPOSIT,
  [LedgerOwnerType.AGENT]: WitmangoWalletPurpose.FLOAT,
};

const BACKSTOP_SETTING: Partial<Record<LedgerOwnerType, string>> = {
  [LedgerOwnerType.CUSTOMER]: 'WALLET_TOPUP_BACKSTOP_CUSTOMER_NGN',
  [LedgerOwnerType.AGENT]: 'WALLET_TOPUP_BACKSTOP_AGENT_NGN',
};

// A PROCESSING record older than this was abandoned mid-flight — the server
// stopped between claiming it and finishing.
const STALE_AFTER_MS = 10 * 60 * 1000;

const WAT_OFFSET_MS = 60 * 60 * 1000;

// Credits a wallet when a bank transfer lands in its reserved account.
//
// By the time this runs the money is already in the vault. The job is to
// make the book agree — exactly once, however many times Monnify delivers
// the notification and whatever fails along the way.
//
//   1. Record the payment first, so it cannot be lost if anything below fails.
//   2. Claim it, so two deliveries cannot both credit it.
//   3. Verify with Monnify directly — the amount and the destination both
//      come from that answer, never from the notification.
//   4. Post the deposit to the CBA under a reference written down beforehand.
//
// A top-up that cannot be completed is never dropped: it stays on record as
// pending or under review, where finance can see it.
@Injectable()
export class ReservedAccountTopUpService {
  private readonly logger = new Logger(ReservedAccountTopUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: PaymentVerificationService,
    private readonly links: WitmangoWalletLinkService,
    private readonly witmango: WitmangoClientService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  isReservedAccountEvent(event: MonnifyReservedAccountEvent): boolean {
    return (
      event.eventData?.product?.type?.trim().toUpperCase() ===
      'RESERVED_ACCOUNT'
    );
  }

  async handle(event: MonnifyReservedAccountEvent): Promise<void> {
    const data = event.eventData;

    const accountReference = data?.product?.reference?.trim();
    const paymentReference = data?.paymentReference?.trim();
    const transactionReference =
      data?.transactionReference?.trim() || paymentReference;

    if (!accountReference || !paymentReference || !transactionReference) {
      this.logger.warn(
        'Reserved account notification is missing its references',
      );

      return;
    }

    const account = await this.prisma.walletReservedAccount.findFirst({
      where: { accountReference },
      include: { wallet: { select: { ownerType: true } } },
    });

    if (!account || account.status !== ReservedAccountStatus.ACTIVE) {
      // Money has arrived for an account this platform does not recognise as
      // live. There is no wallet to attach a record to, so the audit trail
      // is the only place it can be raised — loudly.
      await this.audit.write({
        severity: AuditSeverity.CRITICAL,
        actor: { type: AuditActorType.SYSTEM, id: 'monnify-webhook' },
        action: 'TOPUP_UNMATCHED',
        resource: { type: 'ReservedAccount', id: accountReference },
        metadata: { paymentReference, transactionReference },
      });

      return;
    }

    let funding = await this.prisma.walletFunding.findUnique({
      where: { gatewayReference: paymentReference },
    });

    if (!funding) {
      try {
        funding = await this.prisma.walletFunding.create({
          data: {
            walletId: account.walletId,
            gatewayReference: paymentReference,
            gateway: PaymentGateway.MONNIFY,
            providerTransactionId: transactionReference,
            // Provisional. Replaced by the verified amount before anything
            // is credited; recorded now only so the payment is on file.
            amountNgn: this.provisionalAmount(data?.amountPaid),
            status: WalletFundingStatus.PENDING,
          },
        });
      } catch (error) {
        // The same notification arrived twice at once.
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }

        funding = await this.prisma.walletFunding.findUnique({
          where: { gatewayReference: paymentReference },
        });
      }
    }

    if (!funding || funding.walletId !== account.walletId) {
      this.logger.error(
        `Top-up ${paymentReference} is recorded against a different wallet`,
      );

      return;
    }

    await this.process(funding.fundingId);
  }

  // Finance's lever for a top-up that did not complete on its own.
  //
  // What it will do depends on why the top-up stopped:
  //   - Pending, or refused for a reason that may have cleared: try again.
  //   - Outcome uncertain, or abandoned mid-flight: look for the deposit on
  //     the CBA. If it is there, mark it credited. If not, leave it for a
  //     person — it is never posted a second time on a guess.
  //   - Over limit, wrong amount, unconfirmed destination: left alone. Those
  //     are decisions, not retries.
  async reprocess(fundingId: string, adminId: string) {
    const funding = await this.prisma.walletFunding.findUnique({
      where: { fundingId },
    });

    if (!funding || funding.gateway !== PaymentGateway.MONNIFY) {
      throw new NotFoundException('Top-up not found');
    }

    const before = funding.status;

    const abandoned =
      funding.status === WalletFundingStatus.PROCESSING &&
      Date.now() - funding.updatedAt.getTime() > STALE_AFTER_MS;

    const uncertain =
      funding.status === WalletFundingStatus.REVIEW_REQUIRED &&
      funding.failureReason === REASON.CBA_OUTCOME_UNCERTAIN;

    if (abandoned || uncertain) {
      await this.resolveByLookup(funding.fundingId);

      // An abandoned top-up that never reached the CBA comes back as
      // pending — nothing was posted, so carry straight on and credit it.
      await this.process(fundingId);
    } else if (
      funding.status === WalletFundingStatus.REVIEW_REQUIRED &&
      (funding.failureReason === REASON.CBA_REJECTED ||
        funding.failureReason === REASON.CBA_ACCOUNT_NOT_READY)
    ) {
      // A definite refusal: nothing was posted, so trying again is safe.
      await this.prisma.walletFunding.updateMany({
        where: {
          fundingId,
          status: WalletFundingStatus.REVIEW_REQUIRED,
        },
        data: { status: WalletFundingStatus.PENDING },
      });

      await this.process(fundingId);
    } else if (funding.status === WalletFundingStatus.PENDING) {
      await this.process(fundingId);
    } else {
      throw new ConflictException(
        `A top-up that is ${funding.status}${
          funding.failureReason ? ` (${funding.failureReason})` : ''
        } cannot be reprocessed`,
      );
    }

    const after = await this.prisma.walletFunding.findUnique({
      where: { fundingId },
    });

    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'TOPUP_REPROCESSED',
      resource: { type: 'WalletFunding', id: fundingId },
      metadata: {
        before,
        after: after?.status ?? null,
        reason: after?.failureReason ?? null,
      },
    });

    return {
      fundingId,
      status: after?.status ?? before,
      failureReason: after?.failureReason ?? null,
    };
  }

  private async process(fundingId: string): Promise<void> {
    // Claim it. Only one caller can move a record out of PENDING, so two
    // deliveries of the same notification cannot both credit it.
    const claimed = await this.prisma.walletFunding.updateMany({
      where: { fundingId, status: WalletFundingStatus.PENDING },
      data: { status: WalletFundingStatus.PROCESSING },
    });

    if (claimed.count !== 1) {
      return;
    }

    const funding = await this.prisma.walletFunding.findUnique({
      where: { fundingId },
    });

    if (!funding) {
      return;
    }

    const account = await this.prisma.walletReservedAccount.findFirst({
      where: { walletId: funding.walletId },
      include: { wallet: { select: { ownerType: true } } },
    });

    const ownerType = account?.wallet.ownerType;
    const purpose = ownerType ? CREDIT_PURPOSE[ownerType] : undefined;

    if (!account || !ownerType || !purpose) {
      return this.settle(fundingId, WalletFundingStatus.REVIEW_REQUIRED, {
        failureReason: REASON.DESTINATION_UNCONFIRMED,
      });
    }

    let verified;

    try {
      verified = await this.verification.verifyMonnify(
        funding.gatewayReference,
      );
    } catch {
      verified = null;
    }

    if (!verified) {
      // Could not reach Monnify, or it had no answer yet. Back to pending:
      // the next delivery, or finance, tries again.
      return this.settle(fundingId, WalletFundingStatus.PENDING, {
        failureReason: REASON.VERIFICATION_UNAVAILABLE,
      });
    }

    if (verified.status !== 'SUCCESS') {
      return this.settle(
        fundingId,
        verified.status === 'FAILED'
          ? WalletFundingStatus.FAILED
          : WalletFundingStatus.PENDING,
        { failureReason: REASON.NOT_PAID, lastVerifiedAt: new Date() },
      );
    }

    const amountNgn = verified.amountNgn;

    // Whole naira only. Every balance on this platform is an integer number
    // of naira; a transfer with kobo cannot be credited exactly, and
    // rounding someone's money either way is not a decision for code.
    if (
      verified.currency !== 'NGN' ||
      amountNgn === null ||
      !Number.isSafeInteger(amountNgn) ||
      amountNgn <= 0
    ) {
      return this.settle(fundingId, WalletFundingStatus.REVIEW_REQUIRED, {
        failureReason: REASON.AMOUNT_UNUSABLE,
        lastVerifiedAt: new Date(),
      });
    }

    // The destination is taken from Monnify's verified answer. If that does
    // not name this wallet's reserved account, nothing is credited — the
    // notification alone is not evidence of where the money went.
    if (
      this.verifiedAccountReference(verified.raw) !==
      account.accountReference
    ) {
      return this.settle(fundingId, WalletFundingStatus.REVIEW_REQUIRED, {
        amountNgn,
        failureReason: REASON.DESTINATION_UNCONFIRMED,
        lastVerifiedAt: new Date(),
      });
    }

    // Monnify's limit profile is the real deposit limit and rejects an
    // over-limit transfer at the bank. This is the backstop for the case
    // where that profile is wrong or missing: the money is held for a
    // person, not credited.
    const backstop = Number(
      this.config.get(BACKSTOP_SETTING[ownerType] ?? '') ?? 0,
    );

    if (Number.isFinite(backstop) && backstop > 0 && amountNgn > backstop) {
      return this.settle(fundingId, WalletFundingStatus.REVIEW_REQUIRED, {
        amountNgn,
        failureReason: REASON.OVER_LIMIT,
        lastVerifiedAt: new Date(),
      });
    }

    let cbaAccount;

    try {
      cbaAccount = await this.links.getActiveAccount(
        funding.walletId,
        purpose,
      );
    } catch {
      return this.settle(fundingId, WalletFundingStatus.REVIEW_REQUIRED, {
        amountNgn,
        failureReason: REASON.CBA_ACCOUNT_NOT_READY,
        lastVerifiedAt: new Date(),
      });
    }

    const cbaReference = `sw-top-${fundingId}`;

    // Written down BEFORE the deposit is attempted. If the server stops
    // between here and the CBA's answer, this reference is how the deposit
    // is found again — the CBA offers no duplicate protection of its own.
    await this.prisma.walletFunding.update({
      where: { fundingId },
      data: {
        amountNgn,
        cbaReference,
        cbaSavingsAccountId: cbaAccount.savingsAccountId,
        lastVerifiedAt: new Date(),
      },
    });

    try {
      const posted = await this.witmango.deposit({
        accountId: cbaAccount.savingsAccountId,
        amountNgn,
        transactionDate: this.today(),
        reference: cbaReference,
      });

      await this.credited(fundingId, posted.transactionId, {
        walletId: funding.walletId,
        amountNgn,
        purpose,
        cbaReference,
      });
    } catch (error) {
      if (error instanceof WitmangoUncertainOutcomeError) {
        // The deposit may or may not have landed. Look — never guess.
        await this.settle(fundingId, WalletFundingStatus.REVIEW_REQUIRED, {
          failureReason: REASON.CBA_OUTCOME_UNCERTAIN,
        });

        await this.resolveByLookup(fundingId);

        return;
      }

      // Anything else is a definite "no": nothing was posted.
      //
      // "Unavailable" means the CBA integration is switched off or not
      // configured — that clears on its own, so the top-up waits as pending.
      // Any other error is the CBA, or our own validation, refusing this
      // particular deposit. Retrying that unchanged would fail the same way,
      // so it goes to finance.
      const waitable = error instanceof ServiceUnavailableException;

      this.logger.warn(
        `Top-up ${fundingId} not credited: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );

      await this.settle(
        fundingId,
        waitable
          ? WalletFundingStatus.PENDING
          : WalletFundingStatus.REVIEW_REQUIRED,
        {
          failureReason: waitable
            ? REASON.CBA_UNAVAILABLE
            : REASON.CBA_REJECTED,
        },
      );
    }
  }

  // Settles an uncertain top-up by finding out what actually happened. Marks
  // it credited only if the CBA holds a deposit under its reference, for the
  // right amount, that has not been reversed. Anything else stays in review.
  private async resolveByLookup(fundingId: string): Promise<void> {
    const funding = await this.prisma.walletFunding.findUnique({
      where: { fundingId },
    });

    if (
      !funding ||
      !funding.cbaReference ||
      !funding.cbaSavingsAccountId
    ) {
      // Never reached the point of attempting a deposit, so there is
      // nothing on the CBA to find.
      if (funding?.status === WalletFundingStatus.PROCESSING) {
        await this.settle(fundingId, WalletFundingStatus.PENDING, {
          failureReason: REASON.CBA_UNAVAILABLE,
        });
      }

      return;
    }

    let found;

    try {
      found = await this.witmango.findTransactionByReference(
        funding.cbaSavingsAccountId,
        funding.cbaReference,
      );
    } catch {
      found = undefined;
    }

    if (
      found &&
      found.kind === 'DEPOSIT' &&
      !found.reversed &&
      found.amountNgn === funding.amountNgn
    ) {
      await this.prisma.walletFunding.update({
        where: { fundingId },
        data: {
          status: WalletFundingStatus.CREDITED,
          cbaTransactionId: found.transactionId,
          creditedAt: new Date(),
          failureReason: null,
        },
      });

      return;
    }

    // Not found is NOT treated as "safe to post again". Whether the
    // reference survives on the CBA is unproven until tested in a sandbox,
    // and a wrong guess here credits the customer twice.
    await this.settle(fundingId, WalletFundingStatus.REVIEW_REQUIRED, {
      failureReason: REASON.CBA_OUTCOME_UNCERTAIN,
    });
  }

  private async credited(
    fundingId: string,
    cbaTransactionId: number,
    detail: {
      walletId: string;
      amountNgn: number;
      purpose: WitmangoWalletPurpose;
      cbaReference: string;
    },
  ): Promise<void> {
    await this.prisma.walletFunding.update({
      where: { fundingId },
      data: {
        status: WalletFundingStatus.CREDITED,
        cbaTransactionId,
        creditedAt: new Date(),
        failureReason: null,
      },
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.SYSTEM, id: 'monnify-webhook' },
      action: 'WALLET_TOPUP_CREDITED',
      resource: { type: 'WalletFunding', id: fundingId },
      metadata: { ...detail, cbaTransactionId },
    });
  }

  private async settle(
    fundingId: string,
    status: WalletFundingStatus,
    data: {
      failureReason?: string;
      amountNgn?: number;
      lastVerifiedAt?: Date;
    },
  ): Promise<void> {
    await this.prisma.walletFunding.update({
      where: { fundingId },
      data: { status, ...data },
    });
  }

  // Monnify's verified response names the product a payment was made to.
  private verifiedAccountReference(raw: unknown): string | null {
    const body = (raw as { responseBody?: unknown } | null)?.responseBody;
    const product = (body as { product?: unknown } | null)?.product;

    if (typeof product !== 'object' || product === null) {
      return null;
    }

    const { type, reference } = product as {
      type?: unknown;
      reference?: unknown;
    };

    return typeof type === 'string' &&
      type.trim().toUpperCase() === 'RESERVED_ACCOUNT' &&
      typeof reference === 'string'
      ? reference.trim()
      : null;
  }

  private provisionalAmount(value: unknown): number {
    const amount = Number(value);

    return Number.isFinite(amount) && amount > 0 ? Math.trunc(amount) : 0;
  }

  // Today in Lagos. The CBA rejects a transaction dated in its own future,
  // and between midnight and 1am WAT the UTC date is still yesterday.
  private today(): string {
    return new Date(Date.now() + WAT_OFFSET_MS).toISOString().slice(0, 10);
  }
}