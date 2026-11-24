import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditActorType,
  AuditSeverity,
  ClaimType,
  PrizeClaimStatus,
  PurchaseChannel,
} from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { WitmangoWalletLinkService } from '../integrations/witmango/witmango-wallet-link.service';
import { ClaimsService } from './claims.service';
import { PrizeWalletCreditService } from './prize-wallet-credit.service';

const TICK_MS = 60_000;
const BATCH = 50;

// Two rules for prizes after a draw:
//
// 1. A winner who has not chosen item or cash by the selection deadline gets
//    cash. Nothing is forfeited here; the claim deadline still applies.
//
// 2. Cash prizes on tickets a customer bought directly are paid into their
//    wallet automatically (WHT deducted), once their wallet is set up.
//    Agent-sold tickets are not: the agent pays and is reimbursed. Item
//    prizes are not: the winner chooses. One automatic attempt per claim; if
//    it does not complete, the winner claims as usual.
//
// Rule 2 is off unless PRIZE_AUTO_WALLET_CREDIT_ENABLED and
// WITMANGO_PRIZE_CREDITS_ENABLED are both on.
@Injectable()
export class ClaimDefaultsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClaimDefaultsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly claims: ClaimsService,
    private readonly walletCredit: PrizeWalletCreditService,
    private readonly wallets: WalletService,
    private readonly cbaLinks: WitmangoWalletLinkService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log(`Claim defaults started (every 60s; automatic wallet credit ${this.autoCreditOn() ? 'ON' : 'off'})`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  autoCreditOn(): boolean {
    return (
      this.config.get<boolean>('PRIZE_AUTO_WALLET_CREDIT_ENABLED') === true &&
      this.walletCredit.isEnabled()
    );
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.defaultUndecided();
      if (this.autoCreditOn()) await this.autoCredit();
    } catch (error) {
      this.logger.error(`Claim defaults failed: ${error instanceof Error ? error.message : 'unknown'}`);
    } finally {
      this.running = false;
    }
  }

  private async defaultUndecided(): Promise<void> {
    const due = await this.prisma.prizeClaim.findMany({
      where: { status: PrizeClaimStatus.NOTIFIED, selectionDeadlineAt: { lte: new Date() } },
      select: { claimId: true },
      take: BATCH,
    });
    for (const { claimId } of due) {
      await this.claims.defaultToCash(claimId);
    }
  }

  private async autoCredit(): Promise<void> {
    const now = new Date();
    const candidates = await this.prisma.prizeClaim.findMany({
      where: {
        autoCreditAttemptedAt: null,
        paidByAgentId: null,
        status: { in: [PrizeClaimStatus.NOTIFIED, PrizeClaimStatus.SELECTION_MADE] },
        // Cash chosen or not chosen yet; never an item already chosen.
        OR: [{ claimType: null }, { claimType: ClaimType.CASH }],
        selectionDeadlineAt: { gt: now },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });

    for (const claim of candidates) {
      const ticket = await this.prisma.ticket.findFirst({
        where: { ticketRef: claim.winnerTicketRef },
        select: { purchaseChannel: true, buyerUserId: true },
      });

      // Agent sales (and free jackpot entries) are paid another way.
      if (!ticket || ticket.purchaseChannel !== PurchaseChannel.DIRECT || !ticket.buyerUserId) {
        await this.markAttempted(claim.claimId, 'not a direct customer purchase');
        continue;
      }
      if (await this.claims.itemAllowed(claim)) {
        await this.markAttempted(claim.claimId, 'item prize: the winner chooses');
        continue;
      }

      // Wait (without using the attempt) until the winner's wallet is ready.
      const wallet = await this.wallets.getCustomerWallet(ticket.buyerUserId).catch(() => null);
      if (!wallet || (await this.cbaLinks.getState(wallet.walletId)) !== 'READY') continue;

      const marked = await this.prisma.prizeClaim.updateMany({
        where: { claimId: claim.claimId, autoCreditAttemptedAt: null },
        data: { autoCreditAttemptedAt: now },
      });
      if (marked.count !== 1) continue;

      try {
        const paid = await this.walletCredit.creditToWallet(claim.claimId, {
          sub: ticket.buyerUserId,
          phoneNumber: claim.winnerPhone,
        });
        await this.writeAudit(claim.claimId, AuditSeverity.INFO, 'PRIZE_AUTO_CREDITED', {
          creditedNgn: paid.creditedNgn,
          reference: paid.reference,
        });
      } catch (error) {
        // Failed or uncertain: creditToWallet has already recorded it, and an
        // uncertain credit stays with finance. The winner can claim as usual.
        await this.writeAudit(claim.claimId, AuditSeverity.WARNING, 'PRIZE_AUTO_CREDIT_NOT_COMPLETED', {
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  }

  private async markAttempted(claimId: string, reason: string) {
    await this.prisma.prizeClaim.updateMany({
      where: { claimId, autoCreditAttemptedAt: null },
      data: { autoCreditAttemptedAt: new Date() },
    });
    this.logger.debug(`Claim ${claimId}: no automatic wallet credit (${reason})`);
  }

  private async writeAudit(claimId: string, severity: AuditSeverity, action: string, metadata: Record<string, unknown>) {
    await this.audit
      .write({
        severity,
        actor: { type: AuditActorType.SYSTEM, id: 'claim-defaults' },
        action,
        resource: { type: 'PrizeClaim', id: claimId },
        metadata,
      })
      .catch(() => undefined);
  }
}
