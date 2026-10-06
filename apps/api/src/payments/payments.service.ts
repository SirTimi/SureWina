import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  PaymentGateway as PaymentGatewayEnum,
  PaymentStatus,
  Prisma,
  PurchaseChannel,
  PurchasePricingContext,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CustomerAdminService } from '../admin-ops/customer-admin.service';
import { PaymentGatewayDriver } from './gateway/payment-gateway.interface';
import { InitiatePurchaseDto } from './dto/initiate-purchase.dto';
import { MonnifyDriver } from './gateway/monnify.driver';
import { FlutterwaveDriver } from './gateway/flutterwave.driver';
import { AccountService } from '../account/account.service';
import { PaystackDriver } from './gateway/paystack.driver';
import type { CustomerJwtPayload } from '../auth/auth.types';
import { JackpotOffersService } from './jackpot-offers.service';
import { PromotionalJackpotPaystackPurchaseDto } from './dto/promotional-jackpot-paystack-purchase.dto';

export type InitiatePurchaseResult = {
  authorizationUrl: string;
  reference: string;
  txnId: string;
  amountNgn: number;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly monnify: MonnifyDriver,
    private readonly flutterwave: FlutterwaveDriver,
    private readonly customerAdmin: CustomerAdminService,
    private readonly account: AccountService,
    private readonly paystack: PaystackDriver,
    private readonly jackpotOffers: JackpotOffersService,
  ) {}

  async initiatePurchase(
    dto: InitiatePurchaseDto,
  ): Promise<InitiatePurchaseResult> {
    // 0. Blocked phones cannot purchase — enforced before any other work.
    await this.customerAdmin.assertNotBlocked(dto.phoneE164);
    // Responsible-play: self-exclusion + spend limits (needs the amount, so
    // compute price first — move this call to just after amountNgn is known).

    // 1. Draw must exist and be open for sales.
    const draw = await this.prisma.draw.findUnique({
      where: { drawCode: dto.drawCode },
    });
    if (!draw) {
      throw new NotFoundException('Draw not found');
    }
    if (draw.status !== DrawStatus.ACTIVE) {
      throw new ConflictException('Draw is not open for ticket sales');
    }
    if (draw.cutoffAt.getTime() <= Date.now()) {
      throw new ConflictException('Ticket sales for this draw have closed');
    }

    // 2. Compute amount. Integer naira; kobo = *100 for the gateway.
    const amountNgn = draw.ticketPriceNgn * dto.quantity;
    if (amountNgn <= 0) {
      throw new BadRequestException('Invalid purchase amount');
    }

    await this.account.assertPurchaseAllowed(dto.phoneE164, amountNgn);
    
    const amountKobo = amountNgn * 100;

    // 3. Our own reference — the gateway echoes this back on the webhook.
    const reference = `SW-PAY-${randomUUID()}`;

    // 4. Create the PENDING transaction BEFORE calling the chosen gateway.
    //    The customer's provider choice is immutable for this payment attempt.
    const selectedGateway = PaymentGatewayEnum.PAYSTACK

    const txn =
      await this.prisma.paymentTransaction.create({
        data: {
          gatewayReference:
            reference,

          gateway:
            selectedGateway,

          amountNgn,

          buyerEmail:
            dto.buyerEmail
              ?.trim()
              .toLowerCase() ??
            null,

          buyerPhone:
            dto.phoneE164,

          channel:
            PurchaseChannel.DIRECT,

          ticketCount:
            dto.quantity,

          status:
            PaymentStatus.PENDING,

          /*
          * Bind the purchase to the draw BEFORE touching
          * any external payment provider.
          *
          * PSP metadata may echo the drawCode, but it is
          * no longer authoritative.
          */
          purchaseDrawId:
            draw.drawId,
      },
    });

    // A purchase is the one moment most customers give us an email. Attach it
    // to their account so it can also serve as a sign-in route later. Best
    // effort: a clash with another account must not fail the purchase.
    if (dto.buyerEmail) {
      await this.prisma.user
        .updateMany({
          where: { phoneNumber: dto.phoneE164, email: null },
          data: { email: dto.buyerEmail.trim().toLowerCase() },
        })
        .catch(() => undefined);
    }

    // 5. Initialize only the provider the customer selected.
    //    Never silently fail over to another collection rail.
    try {
      const init = await this.initializeWebPurchase({
        amountKobo,
        reference,
        email: dto.buyerEmail?.trim().toLowerCase() ?? this.syntheticEmail(dto.phoneE164),
        callbackUrl: `${this.config.getOrThrow<string>(
          'PAYMENT_CALLBACK_BASE_URL',
        )}/payment/callback`,
        metadata: {
          txnId: txn.txnId,
          drawCode: dto.drawCode,
          buyerPhone: dto.phoneE164,
          quantity: dto.quantity,
          stateOfPlayCode: dto.stateOfPlayCode,
        },
      });

      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: { type: AuditActorType.CUSTOMER },
        action: 'PAYMENT_INITIATED',
        resource: { type: 'PaymentTransaction', id: txn.txnId },
        metadata: {
          drawCode: dto.drawCode,
          amountNgn,
          quantity: dto.quantity,
          gateway: init.gateway,
        },
      });

      this.logger.log(
        `Payment initiated: ${reference} (${amountNgn} NGN, draw ${dto.drawCode}, via ${init.gateway})`,
      );

      return {
        authorizationUrl: init.authorizationUrl,
        reference,
        txnId: txn.txnId,
        amountNgn,
      };
    } catch (error) {
      await this.prisma.paymentTransaction.update({
        where: { txnId: txn.txnId },
        data: {
          status: PaymentStatus.FAILED,
          failureReason:
            error instanceof Error ? error.message : 'gateway init failed',
        },
      });
      this.logger.error(`Payment init failed for ${reference}`);
      throw error;
    }
  }

  async initiatePromotionalJackpotPurchase(
    user: CustomerJwtPayload,
    offerId: string,
    dto: PromotionalJackpotPaystackPurchaseDto,
  ): Promise<InitiatePurchaseResult> {
    await this.customerAdmin.assertNotBlocked(user.phoneNumber);

    // Preflight for responsible-play controls. The locked transaction below
    // repeats all promotion validation before it creates a payment attempt.
    const preview = await this.jackpotOffers.get(user, offerId);
    await this.account.assertPurchaseAllowed(
      user.phoneNumber,
      preview.offerPriceNgn,
    );

    const prepared = await this.prisma.$transaction(
      async (tx) => {
        const offer =
          await this.jackpotOffers.reserveForPurchaseInTransaction(
            tx,
            user,
            offerId,
          );

        const existing = await tx.paymentTransaction.findFirst({
          where: {
            jackpotDiscountOfferId: offerId,
            status: {
              in: [
                PaymentStatus.PENDING,
                PaymentStatus.CONFIRMED,
                PaymentStatus.REVIEW_REQUIRED,
                PaymentStatus.REFUND_PENDING,
              ],
            },
          },
          select: {
            txnId: true,
            status: true,
          },
        });

        if (existing) {
          throw new ConflictException(
            `This jackpot offer already has a ${existing.status.toLowerCase()} payment attempt`,
          );
        }

        const reference = `SW-PAY-${randomUUID()}`;

        const txn = await tx.paymentTransaction.create({
          data: {
            gatewayReference: reference,
            gateway: PaymentGatewayEnum.PAYSTACK,
            amountNgn: offer.offerPriceNgn,
            buyerEmail: dto.buyerEmail?.trim().toLowerCase() ?? null,
            buyerPhone: user.phoneNumber,
            buyerUserId: user.sub,
            channel: PurchaseChannel.DIRECT,
            pricingContext: PurchasePricingContext.PROMOTIONAL_JACKPOT,
            jackpotDiscountOfferId: offer.offerId,
            ticketCount: 1,
            status: PaymentStatus.PENDING,
            purchaseDrawId: offer.jackpotDrawId,
          },
        });

        return { offer, reference, txn };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if (dto.buyerEmail) {
      await this.prisma.user
        .updateMany({
          where: { userId: user.sub, email: null },
          data: { email: dto.buyerEmail.trim().toLowerCase() },
        })
        .catch(() => undefined);
    }

    try {
      const init = await this.initializeWebPurchase({
        amountKobo: prepared.offer.offerPriceNgn * 100,
        reference: prepared.reference,
        email:
          dto.buyerEmail?.trim().toLowerCase() ??
          this.syntheticEmail(user.phoneNumber),
        callbackUrl: `${this.config.getOrThrow<string>(
          'PAYMENT_CALLBACK_BASE_URL',
        )}/payment/callback`,
        metadata: {
          txnId: prepared.txn.txnId,
          drawCode: prepared.offer.jackpotDraw.drawCode,
          buyerPhone: user.phoneNumber,
          quantity: 1,
          stateOfPlayCode: dto.stateOfPlayCode,
          pricingContext: PurchasePricingContext.PROMOTIONAL_JACKPOT,
          jackpotDiscountOfferId: prepared.offer.offerId,
        },
      });

      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: { type: AuditActorType.CUSTOMER, id: user.sub },
        action: 'PROMOTIONAL_JACKPOT_PAYMENT_INITIATED',
        resource: {
          type: 'PaymentTransaction',
          id: prepared.txn.txnId,
        },
        metadata: {
          offerId: prepared.offer.offerId,
          drawCode: prepared.offer.jackpotDraw.drawCode,
          amountNgn: prepared.offer.offerPriceNgn,
          quantity: 1,
          gateway: init.gateway,
        },
      });

      return {
        authorizationUrl: init.authorizationUrl,
        reference: prepared.reference,
        txnId: prepared.txn.txnId,
        amountNgn: prepared.offer.offerPriceNgn,
      };
    } catch (error) {
      await this.prisma.paymentTransaction.update({
        where: { txnId: prepared.txn.txnId },
        data: {
          status: PaymentStatus.FAILED,
          failureReason:
            error instanceof Error ? error.message : 'gateway init failed',
        },
      });

      await this.jackpotOffers
        .release(user, offerId)
        .catch(() => undefined);

      this.logger.error(
        `Promotional jackpot payment init failed for ${prepared.reference}`,
      );
      throw error;
    }
  }

  private async initializeWebPurchase(
    input: Parameters<PaymentGatewayDriver['initialize']>[0],
  ): Promise<{
    authorizationUrl: string;
    gatewayReference: string;
    gateway: PaymentGatewayEnum;
  }> {
    const result =
      await this.paystack.initialize(
        input,
      );  

    if (
      result.gatewayReference !==
      input.reference
    ) {
      throw new ConflictException(
        'Paystack returned an unexpected payment reference',
      );
    } 

    return {
      ...result,
      gateway:
        PaymentGatewayEnum.PAYSTACK,
    };
  }

  // Gateways require an email. Buyers auth by phone, so synthesise a stable,
  // non-routable address. Real receipts go by SMS.
  private syntheticEmail(phoneE164: string): string {
    const digits = phoneE164.replace(/\D/g, '');
    return `${digits}@buyers.surewina.ng`;
  }
}