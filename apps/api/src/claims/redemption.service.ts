import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import {
  AuditActorType,
  AuditSeverity,
  ClaimType,
  PrizeClaimStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

// Six digits. On its own that is weak, but the code is never sufficient by
// itself — staff must also produce the physical ticket reference, and the
// claim locks after a handful of wrong attempts.
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

@Injectable()
export class RedemptionService {
  private readonly logger = new Logger(RedemptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private generate(): string {
    // randomInt is CSPRNG-backed. Math.random is not, and this guards money.
    return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
  }

  // Issued once, when the claim clears KYC and the winner becomes entitled.
  // Returns the clear code for immediate delivery — it is never readable
  // again after this call.
  async issue(claimId: string): Promise<string> {
    const code = this.generate();

    // Guarded so a re-run of KYC clearance cannot mint a second code and
    // silently invalidate one the winner already has.
    const claimed = await this.prisma.prizeClaim.updateMany({
      where: { claimId, redemptionCodeHash: null },
      data: {
        redemptionCodeHash: this.hash(code),
        redemptionCodeIssuedAt: new Date(),
        redemptionAttempts: 0,
      },
    });

    if (claimed.count === 0) {
      throw new ConflictException('A redemption code has already been issued');
    }

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.SYSTEM },
      action: 'REDEMPTION_CODE_ISSUED',
      resource: { type: 'PrizeClaim', id: claimId },
      metadata: {},
    });

    return code;
  }

  // What staff see before they hand anything over. Read-only: nothing is
  // marked collected until they confirm separately, so a mistyped code or a
  // customer who walks away leaves no trace on the claim.
  async verify(args: {
    adminUserId: string;
    pointId: string | null;
    ticketRef: string;
    code: string;
  }) {
    const claim = await this.prisma.prizeClaim.findFirst({
      where: { winnerTicketRef: args.ticketRef },
      include: {
        drawResult: {
          select: { draw: { select: { prizeDescription: true, drawCode: true } } },
        },
        collectionPoint: { select: { pointId: true, name: true } },
      },
    });
    if (!claim) throw new NotFoundException('No claim found for that ticket');

    if (claim.redeemedAt) {
      throw new ConflictException(
        `Already collected on ${claim.redeemedAt.toISOString().slice(0, 10)}`,
      );
    }
    if (claim.status === PrizeClaimStatus.FORFEITED) {
      throw new ConflictException('This claim has been forfeited');
    }
    if (claim.status !== PrizeClaimStatus.KYC_CLEARED) {
      throw new ConflictException(
        `Not ready for collection — claim is ${claim.status}`,
      );
    }
    if (claim.claimDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException('The collection deadline has passed');
    }
    if (!claim.redemptionCodeHash) {
      throw new ConflictException('No redemption code has been issued yet');
    }
    if (claim.redemptionAttempts >= MAX_ATTEMPTS) {
      throw new ForbiddenException(
        'Too many incorrect attempts. Contact customer care to unlock.',
      );
    }

    // Staff are scoped to their own point. A claim booked at Ikeja cannot be
    // handed over in Enugu, whoever is asking.
    if (
      claim.collectionPointId &&
      args.pointId &&
      claim.collectionPointId !== args.pointId
    ) {
      throw new ForbiddenException(
        `This prize is booked for collection at ${claim.collectionPoint?.name ?? 'another point'}`,
      );
    }

    if (this.hash(args.code) !== claim.redemptionCodeHash) {
      // Counted before the throw, so a brute-force attempt cannot escape the
      // limit by abandoning the request.
      const after = await this.prisma.prizeClaim.update({
        where: { claimId: claim.claimId },
        data: { redemptionAttempts: { increment: 1 } },
        select: { redemptionAttempts: true },
      });

      await this.audit.write({
        severity: AuditSeverity.WARNING,
        actor: { type: AuditActorType.ADMIN, id: args.adminUserId },
        action: 'REDEMPTION_CODE_REJECTED',
        resource: { type: 'PrizeClaim', id: claim.claimId },
        metadata: { ticketRef: args.ticketRef, attempt: after.redemptionAttempts },
      });

      throw new ForbiddenException(
        `Incorrect code. ${MAX_ATTEMPTS - after.redemptionAttempts} attempt(s) remaining.`,
      );
    }

    return {
      claimId: claim.claimId,
      winnerTicketRef: claim.winnerTicketRef,
      winnerPhone: claim.winnerPhone,
      claimType: claim.claimType,
      prizeDescription: claim.drawResult.draw.prizeDescription,
      drawCode: claim.drawResult.draw.drawCode,
      grossPrizeValueNgn: claim.grossPrizeValueNgn,
      whtAmountNgn: claim.whtAmountNgn,
      // What the winner actually receives in hand.
      netPrizeValueNgn: claim.netPrizeValueNgn,
      collectionPoint: claim.collectionPoint?.name ?? null,
      claimDeadlineAt: claim.claimDeadlineAt.toISOString(),
      verified: true,
    };
  }

  // Handover. Separate from verify so the code is checked again at the moment
  // the prize leaves — verifying and confirming are two distinct acts, and
  // only the second one moves anything.
  async confirmHandover(args: {
    adminUserId: string;
    pointId: string | null;
    ticketRef: string;
    code: string;
  }) {
    const verified = await this.verify(args);

    // Guarded on redeemedAt: two staff confirming the same claim at once, or
    // a double-tap, must result in one handover.
    const done = await this.prisma.prizeClaim.updateMany({
      where: { claimId: verified.claimId, redeemedAt: null },
      data: {
        status:
          verified.claimType === ClaimType.PRODUCT
            ? PrizeClaimStatus.DELIVERED
            : PrizeClaimStatus.CASH_PAID,
        redeemedAt: new Date(),
        redeemedByAdminId: args.adminUserId,
        redeemedAtPointId: args.pointId,
        fulfilledAt: new Date(),
      },
    });

    if (done.count === 0) {
      throw new ConflictException('This prize has already been collected');
    }

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: args.adminUserId },
      action: 'PRIZE_HANDED_OVER',
      resource: { type: 'PrizeClaim', id: verified.claimId },
      metadata: {
        ticketRef: verified.winnerTicketRef,
        netPrizeValueNgn: verified.netPrizeValueNgn,
        pointId: args.pointId,
      },
    });

    this.logger.log(
      `Prize handed over: ${verified.winnerTicketRef} — NGN ${verified.netPrizeValueNgn.toLocaleString('en-NG')}`,
    );

    return { ...verified, redeemed: true };
  }
}