import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  AuditActorType,
  AuditSeverity,
  CbaTransfer,
  CbaTransferPurpose,
  CbaTransferStatus,
  WalletPurchaseFundingSource,
  WalletPurchaseStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WitmangoTransferService } from '../integrations/witmango/witmango-transfer.service';
import { CbaWithdrawalService } from '../withdrawals/cba-withdrawal.service';
import { PrizeWalletCreditService } from '../claims/prize-wallet-credit.service';

export type TransferVerdict = {
  // What Witmango's own records show.
  outcome: 'POSTED' | 'NOT_POSTED';
  // The CBA's ID for the transfer, from those records. Required for POSTED.
  cbaTransferId?: number;
  // What was checked, for the audit trail.
  note: string;
};

// A transfer stuck mid-send for this long is treated as unknown.
const STALE_SENDING_MS = 10 * 60 * 1000;

// Settles a CBA transfer whose outcome was unknown, on finance's word
// after checking Witmango's own records, and carries on whatever it was
// part of.
//
// The rule for every kind is the same: once the truth is known, do the
// safe thing. Where a person's money moved and the thing it paid for never
// happened, the money goes back — a purchase is refunded, not completed
// late against a draw that may have closed. Where nothing moved, the
// record is closed. Every decision is audited with the evidence given.
@Injectable()
export class CbaTransferResolutionService {
  private readonly logger = new Logger(CbaTransferResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transfers: WitmangoTransferService,
    private readonly withdrawals: CbaWithdrawalService,
    private readonly prizes: PrizeWalletCreditService,
  ) {}

  async resolve(transferId: string, adminId: string, verdict: TransferVerdict) {
    const note = verdict.note?.trim() ?? '';

    if (note.length < 10 || note.length > 500) {
      throw new BadRequestException(
        'Describe what was checked in Witmango (10 to 500 characters)',
      );
    }

    if (
      verdict.outcome === 'POSTED' &&
      (!Number.isSafeInteger(verdict.cbaTransferId) || (verdict.cbaTransferId ?? 0) <= 0)
    ) {
      throw new BadRequestException(
        'A posted transfer needs the CBA transfer ID from Witmango',
      );
    }

    const transfer = await this.prisma.cbaTransfer.findUnique({ where: { transferId } });

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    const unknown =
      transfer.status === CbaTransferStatus.UNCERTAIN ||
      (transfer.status === CbaTransferStatus.SENDING &&
        Date.now() - transfer.updatedAt.getTime() > STALE_SENDING_MS);

    if (!unknown) {
      throw new ConflictException(
        `Only a transfer with an unknown outcome can be resolved (this one is ${transfer.status})`,
      );
    }

    const settled = await this.prisma.cbaTransfer.updateMany({
      where: {
        transferId,
        status: { in: [CbaTransferStatus.UNCERTAIN, CbaTransferStatus.SENDING] },
      },
      data:
        verdict.outcome === 'POSTED'
          ? {
              status: CbaTransferStatus.POSTED,
              cbaTransferId: verdict.cbaTransferId,
              postedAt: new Date(),
              failureReason: null,
            }
          : {
              status: CbaTransferStatus.FAILED,
              failureReason: 'RESOLVED_NOT_POSTED',
            },
    });

    if (settled.count !== 1) {
      throw new ConflictException('This transfer was resolved by someone else');
    }

    await this.audit
      .write({
        severity: AuditSeverity.CRITICAL,
        actor: { type: AuditActorType.ADMIN, id: adminId },
        action: 'CBA_TRANSFER_RESOLVED',
        resource: { type: 'CbaTransfer', id: transferId },
        metadata: {
          purpose: transfer.purpose,
          amountNgn: transfer.amountNgn,
          outcome: verdict.outcome,
          cbaTransferId: verdict.cbaTransferId ?? null,
          note,
        },
      })
      .catch((error) => {
        this.logger.error(`Audit failed for resolution ${transferId}: ${this.message(error)}`);
      });

    const resolved = await this.prisma.cbaTransfer.findUniqueOrThrow({ where: { transferId } });
    const next = await this.carryOn(resolved);

    return {
      transferId,
      status: resolved.status,
      next,
    };
  }

  // What happens to the record the transfer belonged to.
  private async carryOn(transfer: CbaTransfer): Promise<Record<string, unknown>> {
    try {
      switch (transfer.purpose) {
        case CbaTransferPurpose.WALLET_PURCHASE:
          return await this.settlePurchase(transfer.walletPurchaseId);

        case CbaTransferPurpose.AGENT_SALE:
          return await this.settleAgentSale(transfer);

        case CbaTransferPurpose.REVERSAL:
          return await this.settleReversal(transfer);

        case CbaTransferPurpose.PRIZE_CREDIT:
          return {
            kind: 'PRIZE_CLAIM',
            result: transfer.prizeClaimId
              ? await this.prizes.settleAfterResolution(transfer.prizeClaimId)
              : null,
          };

        case CbaTransferPurpose.WITHDRAWAL_LOCK:
        case CbaTransferPurpose.WITHDRAWAL_RESTORE:
          return await this.settleWithdrawal(transfer);

        case CbaTransferPurpose.AGENT_COMMISSION:
        case CbaTransferPurpose.PRIZE_REIMBURSEMENT:
          // Nothing depends on it. Not posted: it is owed and can be retried.
          return {
            kind: 'OWED_PAYMENT',
            result:
              transfer.status === CbaTransferStatus.POSTED
                ? 'PAID'
                : 'OWED — retry when ready',
          };

        default:
          return { kind: 'NONE' };
      }
    } catch (error) {
      // The verdict stands; the follow-on step can be run again by resolving
      // the next transfer or from the record's own screen.
      this.logger.error(`Follow-on after resolving ${transfer.transferId} failed: ${this.message(error)}`);
      return { kind: 'ERROR', error: this.message(error) };
    }
  }

  // A wallet purchase that stopped mid-payment. Whatever was taken goes back;
  // legs never sent are closed; then the purchase ends as FAILED. If any part
  // is still unknown, it waits.
  private async settlePurchase(purchaseId: string | null): Promise<Record<string, unknown>> {
    if (!purchaseId) return { kind: 'PURCHASE', result: null };

    const purchase = await this.prisma.walletPurchase.findUnique({ where: { purchaseId } });

    if (
      !purchase ||
      purchase.fundingSource !== WalletPurchaseFundingSource.CBA ||
      purchase.status !== WalletPurchaseStatus.REVIEW_REQUIRED
    ) {
      return { kind: 'PURCHASE', purchaseId, status: purchase?.status ?? null };
    }

    const rows = await this.prisma.cbaTransfer.findMany({
      where: { walletPurchaseId: purchaseId },
      orderBy: { createdAt: 'asc' },
    });

    const legs = rows.filter((r) => r.purpose === CbaTransferPurpose.WALLET_PURCHASE);
    const reversals = rows.filter((r) => r.purpose === CbaTransferPurpose.REVERSAL);

    if (
      [...legs, ...reversals].some(
        (r) => r.status === CbaTransferStatus.UNCERTAIN || r.status === CbaTransferStatus.SENDING,
      )
    ) {
      return { kind: 'PURCHASE', purchaseId, status: purchase.status, waiting: 'another transfer is still unresolved' };
    }

    // Legs written down but never sent: close them. PENDING was never
    // claimed, so it was never sent.
    await this.prisma.cbaTransfer.updateMany({
      where: {
        walletPurchaseId: purchaseId,
        purpose: CbaTransferPurpose.WALLET_PURCHASE,
        status: CbaTransferStatus.PENDING,
      },
      data: { status: CbaTransferStatus.FAILED, failureReason: 'NOT_SENT' },
    });

    let allReturned = true;

    for (const leg of legs.filter((l) => l.status === CbaTransferStatus.POSTED)) {
      const existing = reversals.find((r) => r.reversesTransferId === leg.transferId);

      let reversal =
        existing?.status === CbaTransferStatus.FAILED
          ? await this.transfers.retryReturn(existing.transferId)
          : existing ?? (await this.transfers.reverse(leg));

      if (reversal.status === CbaTransferStatus.PENDING) {
        reversal = await this.transfers.execute(reversal.transferId);
      }

      if (reversal.status !== CbaTransferStatus.POSTED) {
        allReturned = false;
      }
    }

    if (!allReturned) {
      return { kind: 'PURCHASE', purchaseId, status: purchase.status, waiting: 'a refund did not post' };
    }

    await this.prisma.walletPurchase.updateMany({
      where: { purchaseId, status: WalletPurchaseStatus.REVIEW_REQUIRED },
      data: { status: WalletPurchaseStatus.FAILED, failureReason: 'REFUNDED_AFTER_REVIEW' },
    });

    return { kind: 'PURCHASE', purchaseId, status: WalletPurchaseStatus.FAILED };
  }

  // An agent sale stopped at an uncertain float payment, so no tickets were
  // issued. If the float did move, it goes back.
  private async settleAgentSale(transfer: CbaTransfer): Promise<Record<string, unknown>> {
    if (transfer.status !== CbaTransferStatus.POSTED || transfer.paymentTxnId) {
      return { kind: 'AGENT_SALE', saleReference: transfer.saleReference, result: 'nothing to return' };
    }

    const reversal = await this.transfers.reverse(transfer);

    return {
      kind: 'AGENT_SALE',
      saleReference: transfer.saleReference,
      floatReturned: reversal.status === CbaTransferStatus.POSTED,
    };
  }

  // A refund whose outcome was unknown. Not posted: sent again. Then the
  // purchase it belongs to is settled.
  private async settleReversal(transfer: CbaTransfer): Promise<Record<string, unknown>> {
    let reversal = transfer;

    if (reversal.status === CbaTransferStatus.FAILED) {
      reversal = await this.transfers.retryReturn(reversal.transferId);
    }

    if (transfer.walletPurchaseId) {
      return this.settlePurchase(transfer.walletPurchaseId);
    }

    return {
      kind: 'REFUND',
      saleReference: transfer.saleReference,
      returned: reversal.status === CbaTransferStatus.POSTED,
    };
  }

  private async settleWithdrawal(transfer: CbaTransfer): Promise<Record<string, unknown>> {
    const withdrawal = await this.prisma.cbaWithdrawal.findFirst({
      where:
        transfer.purpose === CbaTransferPurpose.WITHDRAWAL_LOCK
          ? { lockTransferId: transfer.transferId }
          : { restoreTransferId: transfer.transferId },
      select: { withdrawalId: true },
    });

    if (!withdrawal) return { kind: 'WITHDRAWAL', result: null };

    const view =
      transfer.purpose === CbaTransferPurpose.WITHDRAWAL_LOCK
        ? await this.withdrawals.continueAfterLockResolved(withdrawal.withdrawalId)
        : await this.withdrawals.continueAfterRestoreResolved(withdrawal.withdrawalId);

    return { kind: 'WITHDRAWAL', withdrawalId: withdrawal.withdrawalId, status: view?.status ?? null };
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown';
  }
}
