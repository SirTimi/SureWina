import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditActorType, AuditSeverity, Prisma, PrizeClaimStatus, RetainedPrizeKind } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { V2nSmsService } from './v2n-sms.service';

const SWEEP_MS = 60_000;

// Forfeits abandoned claims: no selection by the selection deadline, or no
// completed KYC by the claim deadline. Never auto-forfeits KYC_CLEARED or
// PRODUCT_BOOKED — those winners are waiting on US, not the reverse; they
// surface for human review instead (Phase 10).
@Injectable()
export class ClaimsSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClaimsSweepService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: V2nSmsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), SWEEP_MS);
    void this.tick();
    this.logger.log(`Claims sweep started (every ${SWEEP_MS / 1000}s)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const now = new Date();
      const expired = await this.prisma.prizeClaim.findMany({
        where: {
          OR: [
            {
              status: PrizeClaimStatus.NOTIFIED,
              selectionDeadlineAt: { lte: now },
            },
            {
              status: {
                in: [
                  PrizeClaimStatus.SELECTION_MADE,
                  PrizeClaimStatus.KYC_PENDING,
                ],
              },
              claimDeadlineAt: { lte: now },
            },
          ],
        },
      });

      for (const claim of expired) {
        await this.forfeit(claim.claimId, claim.status, claim.winnerPhone, claim.winnerTicketRef);
      }
    } catch (error) {
      this.logger.error(
        `Claims sweep failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async forfeit(
    claimId: string,
    fromStatus: PrizeClaimStatus,
    winnerPhone: string,
    winnerRef: string,
  ): Promise<void> {
    // Guarded flip: a concurrent selection/KYC action makes this a no-op.
    // The uncollected prizes ledger entry is written in the same
    // transaction, so a forfeited prize is never missing from the ledger.
    const forfeited = await this.prisma.$transaction(async (tx) => {
      const result = await tx.prizeClaim.updateMany({
        where: { claimId, status: fromStatus },
        data: { status: PrizeClaimStatus.FORFEITED, forfeitedAt: new Date() },
      });
      if (result.count === 0) return false;
      await this.recordUnclaimed(tx, claimId);
      return true;
    });
    if (!forfeited) return;

    await this.prisma.auditLog.create({
      data: {
        severity: AuditSeverity.WARNING,
        actorType: AuditActorType.SYSTEM,
        action: 'CLAIM_FORFEITED',
        resourceType: 'PrizeClaim',
        resourceId: claimId,
        metadata: { fromStatus, winnerRef },
      },
    });

    // Honest closure SMS. Failure is non-fatal — the forfeiture stands.
    try {
      await this.sms.sendSms(
        winnerPhone,
        `Surewina: the claim window for your winning entry ${winnerRef} has closed and the prize is now forfeited. If you believe this is an error, contact support.`,
        `forfeit-${claimId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Forfeit SMS failed for ${claimId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    this.logger.warn(`Forfeited claim ${claimId} (${fromStatus}, ${winnerRef})`);
  }

  // The unclaimed prize goes back to the company: one ledger row per claim
  // (the claim id is unique in the ledger).
  private async recordUnclaimed(tx: Prisma.TransactionClient, claimId: string): Promise<void> {
    const claim = await tx.prizeClaim.findUnique({
      where: { claimId },
      select: {
        grossPrizeValueNgn: true,
        winnerTicketRef: true,
        drawResult: { select: { drawId: true } },
        drawWinner: { select: { tierNo: true } },
      },
    });
    if (!claim || claim.grossPrizeValueNgn <= 0) return;

    await tx.retainedPrize.create({
      data: {
        drawId: claim.drawResult.drawId,
        kind: RetainedPrizeKind.UNCLAIMED,
        amountNgn: claim.grossPrizeValueNgn,
        // Null tier keeps the (draw, kind, tier) key free for every claim.
        tierNo: null,
        claimId,
        note: `Unclaimed prize for ${claim.winnerTicketRef}${claim.drawWinner ? ` (tier ${claim.drawWinner.tierNo})` : ''}`,
      },
    });
  }

}