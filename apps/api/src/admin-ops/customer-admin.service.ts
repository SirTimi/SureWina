import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditActorType, AuditSeverity, DrawStatus, DrawType, JackpotDiscountOfferStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CustomerAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // 360° view by phone — works for guests and registered users alike.
  async detail(phoneNumber: string) {
    const [user, payments, tickets, claims, accumulation, block] =
      await Promise.all([
        this.prisma.user.findUnique({ where: { phoneNumber } }),
        this.prisma.paymentTransaction.aggregate({
          where: { buyerPhone: phoneNumber, status: 'CONFIRMED' },
          _sum: { amountNgn: true, ticketCount: true },
          _count: true,
        }),
        this.prisma.ticket.count({ where: { buyerPhone: phoneNumber } }),
        this.prisma.prizeClaim.findMany({
          where: { winnerPhone: phoneNumber },
          select: {
            claimId: true,
            winnerTicketRef: true,
            status: true,
            grossPrizeValueNgn: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.jackpotAccumulation.findUnique({
          where: { buyerPhone: phoneNumber },
        }),
        this.prisma.blockedPhone.findUnique({ where: { phoneNumber } }),
      ]);

    // Admin progress, like customer progress, is scoped to the open jackpot.
    const now = new Date();
    const activeJackpot = await this.prisma.draw.findFirst({
      where: {
        drawType: DrawType.SATURDAY_JACKPOT,
        status: DrawStatus.ACTIVE,
        cutoffAt: { gt: now },
      },
      orderBy: { scheduledAt: 'asc' },
      select: { drawId: true, drawCode: true },
    });
    const count = activeJackpot &&
      accumulation?.cycleDrawId === activeJackpot.drawId
      ? accumulation.cumulativeCount : 0;
    // Support needs actual entitlements, not a reconstructed 10-ticket
    // prediction. Include earlier jackpot cycles for audit/dispute history.
    const offerRows = await this.prisma.jackpotDiscountOffer.findMany({
      where: { buyerPhone: phoneNumber },
      select: {
        offerId: true,
        jackpotDrawId: true,
        jackpotDraw: {
          select: {
            drawCode: true,
            scheduledAt: true,
          },
        },
        thresholdNumber: true,
        regularTicketsAtUnlock: true,
        originalPriceNgn: true,
        offerPriceNgn: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
        claimedAt: true,
        declinedAt: true,
        offerSmsSentAt: true,
      },
      orderBy: [
        { issuedAt: 'desc' },
        { offerId: 'desc' },
      ],
    });

    // Status may remain AVAILABLE in storage after cutoff until a lazy
    // normalization runs. The support view must not promise an expired
    // entitlement can still be purchased.
    const effectiveStatus = (offer: (typeof offerRows)[number]) =>
      offer.status === JackpotDiscountOfferStatus.AVAILABLE &&
      offer.expiresAt <= now
        ? JackpotDiscountOfferStatus.EXPIRED
        : offer.status;

    const activeOffers = activeJackpot
      ? offerRows.filter((offer) => offer.jackpotDrawId === activeJackpot.drawId)
      : [];
    const countStatus = (status: JackpotDiscountOfferStatus) =>
      activeOffers.filter((offer) => effectiveStatus(offer) === status).length;
    const availableOfferCount = countStatus(JackpotDiscountOfferStatus.AVAILABLE);

    if (!user && payments._count === 0 && tickets === 0 && offerRows.length === 0) {
      throw new NotFoundException('No activity for this phone number');
    }

    return {
      phoneNumber,
      registered: !!user,
      displayName: user?.displayName ?? null,
      kycStatus: user?.kycStatus ?? null,
      blocked: !!block,
      blockReason: block?.reason ?? null,
      lifetime: {
        spendNgn: payments._sum.amountNgn ?? 0,
        ticketsBought: payments._sum.ticketCount ?? 0,
        transactions: payments._count,
        ticketRows: tickets,
      },
      promotion: {
        activeCycle: !!activeJackpot,
        jackpotDrawCode: activeJackpot?.drawCode ?? null,
        weeklyRegularTickets: count,
        offersUnlocked: activeOffers.length,
        available: availableOfferCount,
        claimed: countStatus(JackpotDiscountOfferStatus.CLAIMED),
        declined: countStatus(JackpotDiscountOfferStatus.DECLINED),
        claiming: countStatus(JackpotDiscountOfferStatus.CLAIMING),
        expired: countStatus(JackpotDiscountOfferStatus.EXPIRED),
        ticketsToNextOffer: activeJackpot
          ? count % 10 === 0 ? 10 : 10 - (count % 10)
          : null,
        // All saved offers, including previous jackpot weeks. No offer
        // mutation or financial side effect occurs in this admin lookup.
        offers: offerRows.map((offer) => ({
          offerId: offer.offerId,
          jackpotDrawCode: offer.jackpotDraw.drawCode,
          jackpotScheduledAt: offer.jackpotDraw.scheduledAt.toISOString(),
          thresholdNumber: offer.thresholdNumber,
          regularTicketsAtUnlock: offer.regularTicketsAtUnlock,
          originalPriceNgn: offer.originalPriceNgn,
          offerPriceNgn: offer.offerPriceNgn,
          status: effectiveStatus(offer),
          issuedAt: offer.issuedAt.toISOString(),
          expiresAt: offer.expiresAt.toISOString(),
          claimedAt: offer.claimedAt?.toISOString() ?? null,
          declinedAt: offer.declinedAt?.toISOString() ?? null,
          offerSmsSentAt: offer.offerSmsSentAt?.toISOString() ?? null,
        })),
      },
      accumulation: accumulation
        ? {
            thisWeek: {
              ticketCount: count,
              completedThresholds: Math.floor(count / 10),
              ticketsToNextOffer: count % 10 === 0 ? 10 : 10 - (count % 10),
              availableOfferCount,
              jackpotDrawCode: activeJackpot?.drawCode ?? null,
            },
            // Free entries here are historic, pre-discount-policy records.
            lifetime: {
              ticketCount: accumulation.lifetimeTicketCount,
              entriesEarned: accumulation.lifetimeEntriesTotal,
            },
            lastTicketAt: accumulation.lastTicketAt.toISOString(),
          }
        : null,
      claims: claims.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  async block(phoneNumber: string, reason: string, adminId: string) {
    try {
      await this.prisma.blockedPhone.create({
        data: { phoneNumber, reason, blockedBy: adminId },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Phone is already blocked');
      }
      throw error;
    }
    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'CUSTOMER_BLOCKED',
      resource: { type: 'BlockedPhone', id: phoneNumber },
      metadata: { reason },
    });
    return { phoneNumber, blocked: true, reason };
  }

  async unblock(phoneNumber: string, adminId: string) {
    const existing = await this.prisma.blockedPhone.findUnique({
      where: { phoneNumber },
    });
    if (!existing) throw new NotFoundException('Phone is not blocked');

    await this.prisma.blockedPhone.delete({ where: { phoneNumber } });
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'CUSTOMER_UNBLOCKED',
      resource: { type: 'BlockedPhone', id: phoneNumber },
      metadata: { previousReason: existing.reason },
    });
    return { phoneNumber, blocked: false };
  }

  // The enforcement primitive the purchase doors call.
  async assertNotBlocked(phoneNumber: string): Promise<void> {
    const block = await this.prisma.blockedPhone.findUnique({
      where: { phoneNumber },
    });
    if (block) {
      throw new ConflictException('Purchases are not available for this account');
    }
  }
}