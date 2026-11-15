import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  CbaTransfer,
  CbaTransferPurpose,
  CbaTransferStatus,
  Prisma,
} from '@prisma/client';

import { randomUUID } from 'crypto';

import { PrismaService } from '../../database/prisma.service';

import {
  WitmangoClientService,
  WitmangoTransferEndpoint,
  WitmangoUncertainOutcomeError,
} from './witmango-client.service';

// Why a transfer did not post. Stable codes: finance filters on them.
export const CBA_TRANSFER_REASON = {
  // Nothing was sent: the integration is switched off or not configured.
  CBA_UNAVAILABLE: 'CBA_UNAVAILABLE',
  // The CBA, or our own validation, refused this transfer as sent.
  CBA_REJECTED: 'CBA_REJECTED',
  // The CBA may or may not have posted it.
  CBA_OUTCOME_UNCERTAIN: 'CBA_OUTCOME_UNCERTAIN',
} as const;

export type CbaTransferDraft = {
  purpose: CbaTransferPurpose;
  walletId: string;
  from: WitmangoTransferEndpoint;
  to: WitmangoTransferEndpoint;
  amountNgn: number;
  walletPurchaseId?: string | null;
  paymentTxnId?: string | null;
  saleReference?: string | null;
  reversesTransferId?: string | null;
};

type CbaAccount = {
  clientId: number;
  savingsAccountId: number;
};

const WAT_OFFSET_MS = 60 * 60 * 1000;

// Moves money between two CBA savings accounts, one recorded step at a time.
//
// The CBA has no duplicate protection, and a transfer carries no reference
// of its own that can be searched for afterwards (UNVERIFIED: it is sent in
// the description, but finding it again by that is not proven). So the rule
// here is stricter than for deposits:
//
//   1. Write the transfer down before sending it.
//   2. Claim it, so it can only ever be sent once.
//   3. Record exactly what the CBA answered.
//
// A transfer whose outcome is unknown is never sent again. It is UNCERTAIN,
// or left SENDING if the server stopped mid-call, and a person resolves it.
@Injectable()
export class WitmangoTransferService {
  private readonly logger = new Logger(WitmangoTransferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly witmango: WitmangoClientService,
    private readonly config: ConfigService,
  ) {}

  // The switch for paying from CBA wallets. Off by default. The client's
  // own WITMANGO_MONETARY_ENABLED switch must also be on for anything to
  // actually move.
  isSpendingEnabled(): boolean {
    return (
      this.config.get<boolean>('WITMANGO_WALLET_SPENDING_ENABLED') === true
    );
  }

  // SureWina's own account: ticket money goes in, commission comes out.
  salesEndpoint(): WitmangoTransferEndpoint {
    return {
      officeId: this.positiveConfig('WITMANGO_OFFICE_ID'),
      clientId: this.positiveConfig('WITMANGO_SALES_CLIENT_ID'),
      accountId: this.positiveConfig('WITMANGO_SALES_ACCOUNT_ID'),
    };
  }

  endpoint(account: CbaAccount): WitmangoTransferEndpoint {
    return {
      officeId: this.positiveConfig('WITMANGO_OFFICE_ID'),
      clientId: account.clientId,
      accountId: account.savingsAccountId,
    };
  }

  // Whole naira available to spend from one account, read live from the
  // CBA. Only used to decide which account to take money from; the CBA
  // itself refuses a transfer that would overdraw.
  async availableNgn(account: CbaAccount): Promise<number> {
    const read = await this.witmango.getSavingsAccount(
      account.savingsAccountId,
    );

    if (read.status.id !== 300) {
      throw new ConflictException('This wallet account is not active');
    }

    return Math.max(0, Math.floor(read.summary.availableBalance));
  }

  async createInTransaction(
    tx: Prisma.TransactionClient,
    draft: CbaTransferDraft,
  ): Promise<CbaTransfer> {
    return tx.cbaTransfer.create({ data: this.toData(draft) });
  }

  async create(draft: CbaTransferDraft): Promise<CbaTransfer> {
    return this.prisma.cbaTransfer.create({ data: this.toData(draft) });
  }

  // Sends one transfer, once.
  //
  // Only a PENDING transfer can be sent. Anything else is returned as it
  // stands, so calling this twice for the same transfer never sends it
  // twice.
  async execute(transferId: string): Promise<CbaTransfer> {
    const claimed = await this.prisma.cbaTransfer.updateMany({
      where: { transferId, status: CbaTransferStatus.PENDING },
      data: { status: CbaTransferStatus.SENDING, sentAt: new Date() },
    });

    const transfer = await this.prisma.cbaTransfer.findUniqueOrThrow({
      where: { transferId },
    });

    if (claimed.count !== 1) {
      return transfer;
    }

    let cbaTransferId: number;

    // Only the CBA call is inside this try. If it succeeds and recording
    // that fails, the transfer stays SENDING — unknown, and reviewed —
    // rather than being misread as a refusal.
    try {
      const result = await this.witmango.transfer({
        from: {
          officeId: transfer.fromOfficeId,
          clientId: transfer.fromClientId,
          accountId: transfer.fromAccountId,
        },
        to: {
          officeId: transfer.toOfficeId,
          clientId: transfer.toClientId,
          accountId: transfer.toAccountId,
        },
        amountNgn: transfer.amountNgn,
        transactionDate: this.today(),
        reference: transfer.reference,
      });

      cbaTransferId = result.transferId;
    } catch (error) {
      const outcome = this.classify(error);

      this.logger.warn(
        `CBA transfer ${transfer.reference} ${outcome.status}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );

      return this.prisma.cbaTransfer.update({
        where: { transferId },
        data: {
          status: outcome.status,
          failureReason: outcome.reason,
        },
      });
    }

    return this.prisma.cbaTransfer.update({
      where: { transferId },
      data: {
        status: CbaTransferStatus.POSTED,
        cbaTransferId,
        postedAt: new Date(),
        failureReason: null,
      },
    });
  }

  // Undoes a posted transfer: the same amount, back the other way, as its
  // own recorded transfer. A transfer can only be reversed once — a second
  // call returns the first reversal.
  async reverse(original: CbaTransfer): Promise<CbaTransfer> {
    if (original.status !== CbaTransferStatus.POSTED) {
      throw new ConflictException('Only a posted transfer can be reversed');
    }

    let reversal: CbaTransfer;

    try {
      reversal = await this.create({
        purpose: CbaTransferPurpose.REVERSAL,
        walletId: original.walletId,
        from: {
          officeId: original.toOfficeId,
          clientId: original.toClientId,
          accountId: original.toAccountId,
        },
        to: {
          officeId: original.fromOfficeId,
          clientId: original.fromClientId,
          accountId: original.fromAccountId,
        },
        amountNgn: original.amountNgn,
        walletPurchaseId: original.walletPurchaseId,
        paymentTxnId: original.paymentTxnId,
        saleReference: original.saleReference,
        reversesTransferId: original.transferId,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      reversal = await this.prisma.cbaTransfer.findUniqueOrThrow({
        where: { reversesTransferId: original.transferId },
      });
    }

    return this.execute(reversal.transferId);
  }

  // What a failed CBA call means for the money.
  private classify(error: unknown): {
    status: CbaTransferStatus;
    reason: string;
  } {
    // Checked first: it is a subclass of ServiceUnavailableException.
    if (error instanceof WitmangoUncertainOutcomeError) {
      return {
        status: CbaTransferStatus.UNCERTAIN,
        reason: CBA_TRANSFER_REASON.CBA_OUTCOME_UNCERTAIN,
      };
    }

    // Raised before any request is made: switched off or not configured.
    if (error instanceof ServiceUnavailableException) {
      return {
        status: CbaTransferStatus.FAILED,
        reason: CBA_TRANSFER_REASON.CBA_UNAVAILABLE,
      };
    }

    // The client turns every answer it could not interpret into the
    // uncertain error above, and every 4xx into an HTTP exception. Anything
    // that is still an HTTP exception here is a refusal.
    if (
      error instanceof Error &&
      'getStatus' in error &&
      typeof (error as { getStatus: unknown }).getStatus === 'function'
    ) {
      return {
        status: CbaTransferStatus.FAILED,
        reason: CBA_TRANSFER_REASON.CBA_REJECTED,
      };
    }

    // An error of a kind the client never raises. It cannot be proven that
    // nothing was posted, so it is not treated as a refusal.
    return {
      status: CbaTransferStatus.UNCERTAIN,
      reason: CBA_TRANSFER_REASON.CBA_OUTCOME_UNCERTAIN,
    };
  }

  private toData(
    draft: CbaTransferDraft,
  ): Prisma.CbaTransferUncheckedCreateInput {
    if (!Number.isSafeInteger(draft.amountNgn) || draft.amountNgn <= 0) {
      throw new ConflictException(
        'A CBA transfer must be a positive whole number of naira',
      );
    }

    return {
      // 43 characters: inside the CBA client's 8-50 reference rule.
      reference: `sw-xfr-${randomUUID()}`,
      purpose: draft.purpose,
      status: CbaTransferStatus.PENDING,
      walletId: draft.walletId,
      fromOfficeId: draft.from.officeId,
      fromClientId: draft.from.clientId,
      fromAccountId: draft.from.accountId,
      toOfficeId: draft.to.officeId,
      toClientId: draft.to.clientId,
      toAccountId: draft.to.accountId,
      amountNgn: draft.amountNgn,
      walletPurchaseId: draft.walletPurchaseId ?? null,
      paymentTxnId: draft.paymentTxnId ?? null,
      saleReference: draft.saleReference ?? null,
      reversesTransferId: draft.reversesTransferId ?? null,
    };
  }

  private positiveConfig(name: string): number {
    const value = Number(this.config.get(name));

    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ServiceUnavailableException(`${name} must be configured`);
    }

    return value;
  }

  // The business date in WAT. Between midnight and 1am WAT a UTC date is
  // still yesterday's, which would put the transfer on the wrong day in the
  // CBA's books.
  private today(): string {
    return new Date(Date.now() + WAT_OFFSET_MS).toISOString().slice(0, 10);
  }
}
