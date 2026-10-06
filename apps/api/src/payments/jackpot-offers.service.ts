import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  DrawType,
  JackpotDiscountOfferStatus,
  PaymentStatus,
  Prisma,
  WalletPurchaseStatus,
} from '@prisma/client';
import type {
  CurrentJackpotOffersResponse,
  JackpotOfferView,
} from '@surewina/types';

import { AuditService } from '../audit/audit.service';
import type { CustomerJwtPayload } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

const CLAIM_RESERVATION_MS = 15 * 60 * 1000;

const ACTIVE_PAYMENT_STATUSES = [
  PaymentStatus.PENDING,
  PaymentStatus.CONFIRMED,
  PaymentStatus.REVIEW_REQUIRED,
  PaymentStatus.REFUND_PENDING,
];

const ACTIVE_WALLET_PURCHASE_STATUSES = [
  WalletPurchaseStatus.PENDING,
  WalletPurchaseStatus.COMPLETED,
];

export type OfferWithDraw = {
  offerId: string;
  buyerPhone: string;
  buyerUserId: string | null;
  jackpotDrawId: string;
  thresholdNumber: number;
  regularTicketsAtUnlock: number;
  originalPriceNgn: number;
  offerPriceNgn: number;
  status: JackpotDiscountOfferStatus;
  issuedAt: Date;
  expiresAt: Date;
  claimingAt: Date | null;
  claimedAt: Date | null;
  declinedAt: Date | null;
  jackpotDraw: {
    drawCode: string;
    drawType: DrawType;
    status: DrawStatus;
    scheduledAt: Date;
    cutoffAt: Date;
    ticketPriceNgn: number;
  };
};

const offerInclude = {
  jackpotDraw: {
    select: {
      drawCode: true,
      drawType: true,
      status: true,
      scheduledAt: true,
      cutoffAt: true,
      ticketPriceNgn: true,
    },
  },
} satisfies Prisma.JackpotDiscountOfferInclude;

@Injectable()
export class JackpotOffersService {
  private readonly logger = new Logger(JackpotOffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async current(
    user: CustomerJwtPayload,
  ): Promise<CurrentJackpotOffersResponse> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await this.normalizeCustomerOffers(tx, user, now);

      const offers = await tx.jackpotDiscountOffer.findMany({
        where: {
          buyerPhone: user.phoneNumber,
          buyerUserId: user.sub,
          status: {
            in: [
              JackpotDiscountOfferStatus.AVAILABLE,
              JackpotDiscountOfferStatus.CLAIMING,
            ],
          },
          expiresAt: { gt: now },
        },
        include: offerInclude,
        orderBy: [
          { expiresAt: 'asc' },
          { thresholdNumber: 'asc' },
        ],
      });

      return {
        offers: offers.map((offer) => this.toView(offer)),
      };
    });
  }

  async get(
    user: CustomerJwtPayload,
    offerId: string,
  ): Promise<JackpotOfferView> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await this.normalizeCustomerOffers(tx, user, now);

      const offer = await this.findOwnedOffer(tx, user, offerId);

      if (!offer) {
        throw new NotFoundException('Jackpot offer not found');
      }

      return this.toView(offer);
    });
  }

  async reserve(
    user: CustomerJwtPayload,
    offerId: string,
  ): Promise<JackpotOfferView> {
    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await this.normalizeCustomerOffers(tx, user, now);

      let offer = await this.findOwnedOffer(tx, user, offerId);

      if (!offer) {
        throw new NotFoundException('Jackpot offer not found');
      }

      this.ensureNotExpired(offer, now);

      if (offer.status === JackpotDiscountOfferStatus.CLAIMING) {
        return {
          offer,
          transitioned: false,
        };
      }

      if (offer.status !== JackpotDiscountOfferStatus.AVAILABLE) {
        throw new ConflictException(
          this.unavailableMessage(offer.status),
        );
      }

      const updated = await tx.jackpotDiscountOffer.updateMany({
        where: {
          offerId,
          buyerPhone: user.phoneNumber,
          buyerUserId: user.sub,
          status: JackpotDiscountOfferStatus.AVAILABLE,
          expiresAt: { gt: now },
        },
        data: {
          status: JackpotDiscountOfferStatus.CLAIMING,
          claimingAt: now,
        },
      });

      if (updated.count === 0) {
        offer = await this.findOwnedOffer(tx, user, offerId);

        if (!offer) {
          throw new NotFoundException('Jackpot offer not found');
        }

        this.ensureNotExpired(offer, now);

        if (offer.status !== JackpotDiscountOfferStatus.CLAIMING) {
          throw new ConflictException(
            this.unavailableMessage(offer.status),
          );
        }

        return {
          offer,
          transitioned: false,
        };
      }

      offer = await this.findOwnedOffer(tx, user, offerId);

      if (!offer) {
        throw new NotFoundException('Jackpot offer not found');
      }

      return {
        offer,
        transitioned: true,
      };
    });

    if (result.transitioned) {
      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: {
          type: AuditActorType.CUSTOMER,
          id: user.sub,
        },
        action: 'JACKPOT_DISCOUNT_OFFER_RESERVED',
        resource: {
          type: 'JackpotDiscountOffer',
          id: result.offer.offerId,
        },
        metadata: {
          jackpotDrawId: result.offer.jackpotDrawId,
          thresholdNumber: result.offer.thresholdNumber,
          offerPriceNgn: result.offer.offerPriceNgn,
        },
      });
    }

    return this.toView(result.offer);
  }

  async reserveForPurchaseInTransaction(
    tx: Prisma.TransactionClient,
    user: CustomerJwtPayload,
    offerId: string,
  ): Promise<OfferWithDraw> {
    const locked = await tx.$queryRaw<Array<{ offer_id: string }>>`
      SELECT offer_id
      FROM jackpot_discount_offers
      WHERE offer_id = ${offerId}
      FOR UPDATE
    `;

    if (locked.length === 0) {
      throw new NotFoundException('Jackpot offer not found');
    }

    let offer = await tx.jackpotDiscountOffer.findUnique({
      where: { offerId },
      include: offerInclude,
    });

    if (
      !offer ||
      offer.buyerPhone !== user.phoneNumber ||
      (offer.buyerUserId !== null && offer.buyerUserId !== user.sub)
    ) {
      throw new NotFoundException('Jackpot offer not found');
    }

    if (offer.buyerUserId === null) {
      offer = await tx.jackpotDiscountOffer.update({
        where: { offerId },
        data: { buyerUserId: user.sub },
        include: offerInclude,
      });
    }

    const now = new Date();
    this.ensureNotExpired(offer, now);

    if (
      offer.jackpotDraw.drawType !== DrawType.SATURDAY_JACKPOT ||
      offer.jackpotDraw.status !== DrawStatus.ACTIVE ||
      offer.jackpotDraw.cutoffAt <= now
    ) {
      throw new ConflictException(
        'Jackpot offer draw is not open for promotional purchase',
      );
    }

    if (offer.status === JackpotDiscountOfferStatus.AVAILABLE) {
      return tx.jackpotDiscountOffer.update({
        where: { offerId },
        data: {
          status: JackpotDiscountOfferStatus.CLAIMING,
          claimingAt: now,
        },
        include: offerInclude,
      });
    }

    if (offer.status !== JackpotDiscountOfferStatus.CLAIMING) {
      throw new ConflictException(this.unavailableMessage(offer.status));
    }

    const activeAttempt =
      await this.hasActivePurchaseAttemptInTransaction(tx, offerId);

    const stale =
      !offer.claimingAt ||
      offer.claimingAt.getTime() <= now.getTime() - CLAIM_RESERVATION_MS;

    if (stale && !activeAttempt) {
      offer = await tx.jackpotDiscountOffer.update({
        where: { offerId },
        data: { claimingAt: now },
        include: offerInclude,
      });
    }

    return offer;
  }

  async validatePromotionalPaymentInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      offerId: string | null;
      buyerPhone: string;
      buyerUserId: string | null;
      purchaseDrawId: string;
      amountNgn: number;
      ticketCount: number;
      effectivePaidAt: Date;
    },
  ): Promise<{ offer: OfferWithDraw | null; issues: string[] }> {
    const issues: string[] = [];

    if (!input.offerId) {
      return { offer: null, issues: ['PROMOTIONAL_PURCHASE_MISSING_OFFER'] };
    }

    const locked = await tx.$queryRaw<Array<{ offer_id: string }>>`
      SELECT offer_id
      FROM jackpot_discount_offers
      WHERE offer_id = ${input.offerId}
      FOR UPDATE
    `;

    if (locked.length === 0) {
      return { offer: null, issues: ['PROMOTIONAL_OFFER_NOT_FOUND'] };
    }

    const offer = await tx.jackpotDiscountOffer.findUnique({
      where: { offerId: input.offerId },
      include: offerInclude,
    });

    if (!offer) {
      return { offer: null, issues: ['PROMOTIONAL_OFFER_NOT_FOUND'] };
    }

    if (offer.buyerPhone !== input.buyerPhone) {
      issues.push('PROMOTIONAL_OFFER_BUYER_PHONE_MISMATCH');
    }
    if (!input.buyerUserId || offer.buyerUserId !== input.buyerUserId) {
      issues.push('PROMOTIONAL_OFFER_BUYER_USER_MISMATCH');
    }
    if (offer.jackpotDrawId !== input.purchaseDrawId) {
      issues.push('PROMOTIONAL_OFFER_DRAW_MISMATCH');
    }
    if (offer.offerPriceNgn !== input.amountNgn) {
      issues.push('PROMOTIONAL_OFFER_AMOUNT_MISMATCH');
    }
    if (input.ticketCount !== 1) {
      issues.push('PROMOTIONAL_OFFER_QUANTITY_MUST_BE_ONE');
    }
    if (offer.jackpotDraw.drawType !== DrawType.SATURDAY_JACKPOT) {
      issues.push('PROMOTIONAL_OFFER_TARGET_IS_NOT_JACKPOT');
    }
    if (offer.status !== JackpotDiscountOfferStatus.CLAIMING) {
      issues.push(`PROMOTIONAL_OFFER_STATUS_${offer.status}`);
    }
    if (input.effectivePaidAt >= offer.expiresAt) {
      issues.push('PROMOTIONAL_OFFER_PAYMENT_AFTER_EXPIRY');
    }

    return { offer, issues };
  }

  async markClaimedInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      offerId: string;
      buyerPhone: string;
      buyerUserId: string;
      jackpotDrawId: string;
      amountNgn: number;
      claimedAt?: Date;
    },
  ) {
    const updated = await tx.jackpotDiscountOffer.updateMany({
      where: {
        offerId: input.offerId,
        buyerPhone: input.buyerPhone,
        buyerUserId: input.buyerUserId,
        jackpotDrawId: input.jackpotDrawId,
        offerPriceNgn: input.amountNgn,
        status: JackpotDiscountOfferStatus.CLAIMING,
      },
      data: {
        status: JackpotDiscountOfferStatus.CLAIMED,
        claimingAt: null,
        claimedAt: input.claimedAt ?? new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new ConflictException('Jackpot offer could not be finalized');
    }
  }

  async release(
    user: CustomerJwtPayload,
    offerId: string,
  ): Promise<JackpotOfferView> {
    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await this.normalizeCustomerOffers(tx, user, now);

      let offer = await this.findOwnedOffer(tx, user, offerId);

      if (!offer) {
        throw new NotFoundException('Jackpot offer not found');
      }

      this.ensureNotExpired(offer, now);

      if (offer.status === JackpotDiscountOfferStatus.AVAILABLE) {
        return {
          offer,
          transitioned: false,
        };
      }

      if (offer.status !== JackpotDiscountOfferStatus.CLAIMING) {
        throw new ConflictException(
          this.unavailableMessage(offer.status),
        );
      }

      if (
        await this.hasActivePurchaseAttemptInTransaction(
          tx,
          offerId,
        )
      ) {
        throw new ConflictException(
          'Jackpot offer has an active payment attempt',
        );
      }

      const updated = await tx.jackpotDiscountOffer.updateMany({
        where: {
          offerId,
          buyerPhone: user.phoneNumber,
          buyerUserId: user.sub,
          status: JackpotDiscountOfferStatus.CLAIMING,
        },
        data: {
          status: JackpotDiscountOfferStatus.AVAILABLE,
          claimingAt: null,
        },
      });

      if (updated.count === 0) {
        offer = await this.findOwnedOffer(tx, user, offerId);

        if (!offer) {
          throw new NotFoundException('Jackpot offer not found');
        }

        if (offer.status !== JackpotDiscountOfferStatus.AVAILABLE) {
          throw new ConflictException(
            this.unavailableMessage(offer.status),
          );
        }

        return {
          offer,
          transitioned: false,
        };
      }

      offer = await this.findOwnedOffer(tx, user, offerId);

      if (!offer) {
        throw new NotFoundException('Jackpot offer not found');
      }

      return {
        offer,
        transitioned: true,
      };
    });

    if (result.transitioned) {
      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: {
          type: AuditActorType.CUSTOMER,
          id: user.sub,
        },
        action: 'JACKPOT_DISCOUNT_OFFER_RELEASED',
        resource: {
          type: 'JackpotDiscountOffer',
          id: result.offer.offerId,
        },
        metadata: {
          jackpotDrawId: result.offer.jackpotDrawId,
          thresholdNumber: result.offer.thresholdNumber,
        },
      });
    }

    return this.toView(result.offer);
  }

  async decline(
    user: CustomerJwtPayload,
    offerId: string,
  ): Promise<JackpotOfferView> {
    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await this.normalizeCustomerOffers(tx, user, now);

      let offer = await this.findOwnedOffer(tx, user, offerId);

      if (!offer) {
        throw new NotFoundException('Jackpot offer not found');
      }

      this.ensureNotExpired(offer, now);

      if (offer.status === JackpotDiscountOfferStatus.DECLINED) {
        return {
          offer,
          transitioned: false,
        };
      }

      if (offer.status === JackpotDiscountOfferStatus.CLAIMING) {
        throw new ConflictException(
          'Jackpot offer checkout is already in progress',
        );
      }

      if (offer.status !== JackpotDiscountOfferStatus.AVAILABLE) {
        throw new ConflictException(
          this.unavailableMessage(offer.status),
        );
      }

      const updated = await tx.jackpotDiscountOffer.updateMany({
        where: {
          offerId,
          buyerPhone: user.phoneNumber,
          buyerUserId: user.sub,
          status: JackpotDiscountOfferStatus.AVAILABLE,
          expiresAt: { gt: now },
        },
        data: {
          status: JackpotDiscountOfferStatus.DECLINED,
          claimingAt: null,
          declinedAt: now,
        },
      });

      if (updated.count === 0) {
        offer = await this.findOwnedOffer(tx, user, offerId);

        if (!offer) {
          throw new NotFoundException('Jackpot offer not found');
        }

        if (offer.status !== JackpotDiscountOfferStatus.DECLINED) {
          throw new ConflictException(
            this.unavailableMessage(offer.status),
          );
        }

        return {
          offer,
          transitioned: false,
        };
      }

      offer = await this.findOwnedOffer(tx, user, offerId);

      if (!offer) {
        throw new NotFoundException('Jackpot offer not found');
      }

      return {
        offer,
        transitioned: true,
      };
    });

    if (result.transitioned) {
      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: {
          type: AuditActorType.CUSTOMER,
          id: user.sub,
        },
        action: 'JACKPOT_DISCOUNT_OFFER_DECLINED',
        resource: {
          type: 'JackpotDiscountOffer',
          id: result.offer.offerId,
        },
        metadata: {
          jackpotDrawId: result.offer.jackpotDrawId,
          thresholdNumber: result.offer.thresholdNumber,
        },
      });
    }

    return this.toView(result.offer);
  }

  private async normalizeCustomerOffers(
    tx: Prisma.TransactionClient,
    user: CustomerJwtPayload,
    now: Date,
  ) {
    // Agent and guest purchases may have no user id yet. OTP sign-in proves
    // ownership of the phone number, so bind those offers once to the verified
    // customer account. We never expose a raw phone-number lookup endpoint.
    await tx.jackpotDiscountOffer.updateMany({
      where: {
        buyerPhone: user.phoneNumber,
        buyerUserId: null,
      },
      data: {
        buyerUserId: user.sub,
      },
    });

    await tx.jackpotDiscountOffer.updateMany({
      where: {
        buyerPhone: user.phoneNumber,
        buyerUserId: user.sub,
        status: {
          in: [
            JackpotDiscountOfferStatus.AVAILABLE,
            JackpotDiscountOfferStatus.CLAIMING,
          ],
        },
        expiresAt: { lte: now },
        paymentTransactions: {
          none: {
            status: {
              in: ACTIVE_PAYMENT_STATUSES,
            },
          },
        },
        walletPurchases: {
          none: {
            status: {
              in: ACTIVE_WALLET_PURCHASE_STATUSES,
            },
          },
        },
      },
      data: {
        status: JackpotDiscountOfferStatus.EXPIRED,
        claimingAt: null,
      },
    });

    const staleBefore = new Date(now.getTime() - CLAIM_RESERVATION_MS);

    await tx.jackpotDiscountOffer.updateMany({
      where: {
        buyerPhone: user.phoneNumber,
        buyerUserId: user.sub,
        status: JackpotDiscountOfferStatus.CLAIMING,
        expiresAt: { gt: now },
        OR: [
          { claimingAt: null },
          { claimingAt: { lte: staleBefore } },
        ],
        paymentTransactions: {
          none: {
            status: {
              in: ACTIVE_PAYMENT_STATUSES,
            },
          },
        },
        walletPurchases: {
          none: {
            status: {
              in: ACTIVE_WALLET_PURCHASE_STATUSES,
            },
          },
        },
      },
      data: {
        status: JackpotDiscountOfferStatus.AVAILABLE,
        claimingAt: null,
      },
    });
  }

  private async hasActivePurchaseAttemptInTransaction(
    tx: Prisma.TransactionClient,
    offerId: string,
  ) {
    const [paymentCount, walletPurchaseCount] = await Promise.all([
      tx.paymentTransaction.count({
        where: {
          jackpotDiscountOfferId: offerId,
          status: { in: ACTIVE_PAYMENT_STATUSES },
        },
      }),
      tx.walletPurchase.count({
        where: {
          jackpotDiscountOfferId: offerId,
          status: { in: ACTIVE_WALLET_PURCHASE_STATUSES },
        },
      }),
    ]);

    return paymentCount > 0 || walletPurchaseCount > 0;
  }
  private findOwnedOffer(
    tx: Prisma.TransactionClient,
    user: CustomerJwtPayload,
    offerId: string,
  ) {
    return tx.jackpotDiscountOffer.findFirst({
      where: {
        offerId,
        buyerPhone: user.phoneNumber,
        buyerUserId: user.sub,
      },
      include: offerInclude,
    });
  }

  private ensureNotExpired(
    offer: OfferWithDraw,
    now: Date,
  ) {
    if (
      offer.status === JackpotDiscountOfferStatus.EXPIRED ||
      offer.expiresAt <= now
    ) {
      throw new ConflictException('Jackpot offer has expired');
    }
  }

  private unavailableMessage(
    status: JackpotDiscountOfferStatus,
  ) {
    switch (status) {
      case JackpotDiscountOfferStatus.CLAIMED:
        return 'Jackpot offer has already been claimed';
      case JackpotDiscountOfferStatus.DECLINED:
        return 'Jackpot offer has been declined';
      case JackpotDiscountOfferStatus.EXPIRED:
        return 'Jackpot offer has expired';
      case JackpotDiscountOfferStatus.CLAIMING:
        return 'Jackpot offer checkout is already in progress';
      default:
        return 'Jackpot offer is not available';
    }
  }

  private toView(
    offer: OfferWithDraw,
  ): JackpotOfferView {
    const reservationExpiresAt =
      offer.status === JackpotDiscountOfferStatus.CLAIMING &&
      offer.claimingAt
        ? new Date(
            Math.min(
              offer.claimingAt.getTime() + CLAIM_RESERVATION_MS,
              offer.expiresAt.getTime(),
            ),
          ).toISOString()
        : null;

    return {
      offerId: offer.offerId,
      jackpotDrawId: offer.jackpotDrawId,
      jackpotDrawCode: offer.jackpotDraw.drawCode,
      jackpotScheduledAt: offer.jackpotDraw.scheduledAt.toISOString(),
      thresholdNumber: offer.thresholdNumber,
      regularTicketsAtUnlock: offer.regularTicketsAtUnlock,
      originalPriceNgn: offer.originalPriceNgn,
      offerPriceNgn: offer.offerPriceNgn,
      status: offer.status,
      issuedAt: offer.issuedAt.toISOString(),
      expiresAt: offer.expiresAt.toISOString(),
      claimingAt: offer.claimingAt?.toISOString() ?? null,
      reservationExpiresAt,
      claimedAt: offer.claimedAt?.toISOString() ?? null,
      declinedAt: offer.declinedAt?.toISOString() ?? null,
    };
  }
}
