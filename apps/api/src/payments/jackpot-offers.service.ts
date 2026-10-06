import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  JackpotDiscountOfferStatus,
  Prisma,
} from '@prisma/client';
import type {
  CurrentJackpotOffersResponse,
  JackpotOfferView,
} from '@surewina/types';

import { AuditService } from '../audit/audit.service';
import type { CustomerJwtPayload } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

const CLAIM_RESERVATION_MS = 15 * 60 * 1000;

type OfferWithDraw = {
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
    scheduledAt: Date;
  };
};

const offerInclude = {
  jackpotDraw: {
    select: {
      drawCode: true,
      scheduledAt: true,
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
      },
      data: {
        status: JackpotDiscountOfferStatus.AVAILABLE,
        claimingAt: null,
      },
    });
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
