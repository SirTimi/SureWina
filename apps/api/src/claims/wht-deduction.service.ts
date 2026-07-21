import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

// Issues an immutable WHT certificate for a fulfilled, WHT-applicable claim.
// Idempotent: one certificate per claim, enforced by the unique claimId.
@Injectable()
export class WhtDeductionService {
  private readonly logger = new Logger(WhtDeductionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async recordForClaim(claimId: string): Promise<void> {
    const claim = await this.prisma.prizeClaim.findUnique({
      where: { claimId },
      select: {
        claimId: true,
        winnerTicketRef: true,
        winnerPhone: true,
        grossPrizeValueNgn: true,
        whtApplicable: true,
        whtAmountNgn: true,
        netPrizeValueNgn: true,
        whtDeduction: { select: { deductionRef: true } },
      },
    });

    if (!claim) return;
    if (!claim.whtApplicable || claim.whtAmountNgn <= 0) return;
    if (claim.whtDeduction) return; // already issued — idempotent

    const rate = Number(this.config.get('WHT_RATE_PERCENT') ?? 5);

    try {
      const certNo = await this.prisma.$transaction(async (tx) => {
        const created = await tx.whtDeduction.create({
          data: {
            deductionRef: `PENDING-${claim.claimId}`,
            claimId: claim.claimId,
            winnerTicketRef: claim.winnerTicketRef,
            winnerPhone: claim.winnerPhone,
            grossPrizeNgn: claim.grossPrizeValueNgn,
            whtRatePercent: rate,
            whtAmountNgn: claim.whtAmountNgn,
            netPrizeNgn: claim.netPrizeValueNgn,
          },
        });
        const deductionRef = `WHD-${new Date().getUTCFullYear()}-${String(created.deductionSeq).padStart(6, '0')}`;
        await tx.whtDeduction.update({
          where: { deductionSeq: created.deductionSeq },
          data: { deductionRef },
        });
        return deductionRef;
      });

      this.logger.log(`Issued ${certNo} for claim ${claimId}`);
    } catch (e) {
      // Unique-violation race (two fulfillment paths) = already issued; fine.
      if ((e as { code?: string }).code !== 'P2002') {
        this.logger.error(
          `WHT certificate issuance failed for ${claimId}: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    }
  }
}