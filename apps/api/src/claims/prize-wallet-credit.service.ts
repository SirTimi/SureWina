import {
  ConflictException,
  ForbiddenException,
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
  ClaimType,
  Prisma,
  PrizeClaimStatus,
  WitmangoWalletPurpose,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../config/settings.service';
import { WalletService } from '../wallet/wallet.service';
import { WitmangoWalletLinkService } from '../integrations/witmango/witmango-wallet-link.service';
import { WitmangoTransferService } from '../integrations/witmango/witmango-transfer.service';

import { computeWht } from './wht-calculation';
import { WhtDeductionService } from './wht-deduction.service';

// Marks a claim paid into the winner's CBA wallet, as opposed to a bank
// payout provider. Never handed to the payout provider registry.
export const WALLET_PAYOUT_PROVIDER = 'CBA_WALLET';

// The statuses in which the winner may still choose how to be paid.
const CHOOSABLE: PrizeClaimStatus[] = [
  PrizeClaimStatus.NOTIFIED,
  PrizeClaimStatus.SELECTION_MADE,
];

function reviewMessage(claimId: string): string {
  return (
    'We could not confirm the credit to your wallet. Your prize is safe: ' +
    'support will confirm it and complete the payment. ' +
    `Claim: ${claimId}`
  );
}

// Pays a cash prize into the winner's CBA Winnings account.
//
// The winner chooses this instead of a bank payout. No bank KYC is needed:
// the winner's identity was BVN-verified when their wallet was opened, and
// money can only leave Winnings to a bank account matched to that BVN.
//
// WHT is deducted exactly as for a bank payout, and the net amount is
// transferred from SureWina's sales account. Like every CBA movement, the
// transfer is written down before it is sent, and an uncertain answer is
// left for a person — the claim stays WALLET_CREDIT_PENDING, never re-paid.
@Injectable()
export class PrizeWalletCreditService {
  private readonly logger = new Logger(PrizeWalletCreditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
    private readonly wallets: WalletService,
    private readonly whtDeductions: WhtDeductionService,
    private readonly cbaLinks: WitmangoWalletLinkService,
    private readonly cbaTransfers: WitmangoTransferService,
  ) {}

  isEnabled(): boolean {
    return (
      this.config.get<boolean>('WITMANGO_PRIZE_CREDITS_ENABLED') === true
    );
  }

  async creditToWallet(
    claimId: string,
    user: { sub: string; phoneNumber: string },
  ) {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Paying prizes into your wallet is not available yet',
      );
    }

    const claim = await this.prisma.prizeClaim.findUnique({
      where: { claimId },
    });

    if (!claim || claim.winnerPhone !== user.phoneNumber) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.winnerUserId && claim.winnerUserId !== user.sub) {
      throw new ForbiddenException('This claim belongs to another account');
    }

    if (!CHOOSABLE.includes(claim.status)) {
      throw new ConflictException(
        `This prize can no longer be paid into your wallet (status: ${claim.status})`,
      );
    }

    if (claim.selectionDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException(
        'The selection window for this claim has closed',
      );
    }

    const wallet = await this.wallets.getCustomerWallet(user.sub);

    if ((await this.cbaLinks.getState(wallet.walletId)) !== 'READY') {
      throw new ConflictException(
        'Set up your wallet before taking a prize into it',
      );
    }

    const winnings = await this.cbaLinks.getActiveAccount(
      wallet.walletId,
      WitmangoWalletPurpose.WINNINGS,
    );

    const sales = this.cbaTransfers.salesEndpoint();

    const wht = await computeWht(
      this.settings,
      claim.grossPrizeValueNgn,
      ClaimType.CASH,
    );

    if (!Number.isSafeInteger(wht.netPrizeValueNgn) || wht.netPrizeValueNgn <= 0) {
      throw new ConflictException('This prize has no cash amount to pay');
    }

    // Claim and transfer are written together, before any money moves. The
    // new status takes the claim out of every other route — the winner
    // cannot switch to bank or product, an agent cannot pay it in cash, and
    // the forfeit sweep does not touch it.
    const transfer = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "claim_id"
          FROM "prize_claims"
          WHERE "claim_id" = ${claimId}
          FOR UPDATE
        `;

        const current = await tx.prizeClaim.findUniqueOrThrow({
          where: { claimId },
        });

        if (!CHOOSABLE.includes(current.status) || current.paidByAgentId) {
          throw new ConflictException(
            'This prize can no longer be paid into your wallet',
          );
        }

        const created = await this.cbaTransfers.createInTransaction(tx, {
          purpose: CbaTransferPurpose.PRIZE_CREDIT,
          walletId: wallet.walletId,
          from: sales,
          to: this.cbaTransfers.endpoint(winnings),
          amountNgn: wht.netPrizeValueNgn,
          prizeClaimId: claimId,
        });

        const now = new Date();

        await tx.prizeClaim.update({
          where: { claimId },
          data: {
            claimType: ClaimType.CASH,
            claimTypeSelectedAt: current.claimTypeSelectedAt ?? now,
            ...wht,
            status: PrizeClaimStatus.WALLET_CREDIT_PENDING,
            winnerUserId: current.winnerUserId ?? user.sub,
            payoutProvider: WALLET_PAYOUT_PROVIDER,
            payoutReference: created.reference,
            payoutInitiatedAt: now,
            payoutFailureReason: null,
          },
        });

        return created;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    const sent = await this.cbaTransfers.execute(transfer.transferId);

    if (sent.status === CbaTransferStatus.POSTED) {
      const paidAt = new Date();

      await this.prisma.prizeClaim.update({
        where: { claimId },
        data: {
          status: PrizeClaimStatus.CASH_PAID,
          payoutCompletedAt: paidAt,
          fulfilledAt: paidAt,
        },
      });

      // The tax certificate follows the payment, as on the bank route.
      await this.whtDeductions.recordForClaim(claimId);

      await this.writeAudit(user.phoneNumber, claimId, {
        severity: AuditSeverity.INFO,
        action: 'PRIZE_CREDITED_TO_WALLET',
        metadata: {
          grossPrizeValueNgn: claim.grossPrizeValueNgn,
          whtAmountNgn: wht.whtAmountNgn,
          creditedNgn: wht.netPrizeValueNgn,
          reference: sent.reference,
        },
      });

      return {
        claimId,
        status: PrizeClaimStatus.CASH_PAID,
        grossPrizeValueNgn: claim.grossPrizeValueNgn,
        whtAmountNgn: wht.whtAmountNgn,
        creditedNgn: wht.netPrizeValueNgn,
        reference: sent.reference,
      };
    }

    if (sent.status === CbaTransferStatus.FAILED) {
      // Nothing was paid. The winner is back where they were and may try
      // again or choose a bank payout.
      await this.prisma.prizeClaim.update({
        where: { claimId },
        data: {
          status: PrizeClaimStatus.SELECTION_MADE,
          payoutProvider: null,
          payoutReference: null,
          payoutInitiatedAt: null,
          payoutFailureReason: sent.failureReason,
        },
      });

      await this.writeAudit(user.phoneNumber, claimId, {
        severity: AuditSeverity.WARNING,
        action: 'PRIZE_WALLET_CREDIT_FAILED',
        metadata: { reason: sent.failureReason, reference: sent.reference },
      });

      throw new ConflictException(
        'Your prize could not be paid into your wallet. Nothing was lost — try again, or choose a bank payout.',
      );
    }

    // Uncertain. The claim stays WALLET_CREDIT_PENDING until a person
    // establishes whether the credit landed.
    await this.writeAudit(user.phoneNumber, claimId, {
      severity: AuditSeverity.CRITICAL,
      action: 'PRIZE_WALLET_CREDIT_UNCERTAIN',
      metadata: { status: sent.status, reference: sent.reference },
    });

    throw new ServiceUnavailableException(reviewMessage(claimId));
  }

  private async writeAudit(
    phoneNumber: string,
    claimId: string,
    entry: {
      severity: AuditSeverity;
      action: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await this.audit
      .write({
        severity: entry.severity,
        actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
        action: entry.action,
        resource: { type: 'PrizeClaim', id: claimId },
        metadata: entry.metadata,
      })
      .catch((error) => {
        this.logger.error(
          `Audit failed for prize claim ${claimId}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      });
  }
}
