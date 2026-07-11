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
  PurchaseChannel,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CustomerAdminService } from '../admin-ops/customer-admin.service';
import { PaymentGatewayDriver } from './gateway/payment-gateway.interface';
import { InitiatePurchaseDto } from './dto/initiate-purchase.dto';
import { PaystackDriver } from './gateway/paystack.driver';
import { FlutterwaveDriver } from './gateway/flutterwave.driver';

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
    private readonly paystack: PaystackDriver,
    private readonly flutterwave: FlutterwaveDriver,
    private readonly customerAdmin: CustomerAdminService,
  ) {}

  async initiatePurchase(
    dto: InitiatePurchaseDto,
  ): Promise<InitiatePurchaseResult> {
    // 0. Blocked phones cannot purchase — enforced before any other work.
    await this.customerAdmin.assertNotBlocked(dto.phoneE164);

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
    const amountKobo = amountNgn * 100;

    // 3. Our own reference — the gateway echoes this back on the webhook.
    const reference = `SW-PAY-${randomUUID()}`;

    // 4. Create the PENDING transaction BEFORE calling any gateway, so a
    //    webhook can never arrive for a txn we don't have on record.
    //    Recorded as PAYSTACK initially; flipped if we fall back.
    const txn = await this.prisma.paymentTransaction.create({
      data: {
        gatewayReference: reference,
        gateway: this.paystack.gateway,
        amountNgn,
        buyerPhone: dto.phoneE164,
        channel: PurchaseChannel.DIRECT,
        ticketCount: dto.quantity,
        status: PaymentStatus.PENDING,
      },
    });

    // 5. Try Paystack, fall back to Flutterwave. If both fail, mark FAILED.
    try {
      const init = await this.initializeWithFallback(txn.txnId, {
        amountKobo,
        reference,
        email: this.syntheticEmail(dto.phoneE164),
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

  // Primary: Paystack. On any initialization failure, fall back to
  // Flutterwave and re-tag the transaction so the right webhook reconciles.
  private async initializeWithFallback(
    txnId: string,
    input: Parameters<PaymentGatewayDriver['initialize']>[0],
  ): Promise<{
    authorizationUrl: string;
    gatewayReference: string;
    gateway: PaymentGatewayEnum;
  }> {
    try {
      const result = await this.paystack.initialize(input);
      return { ...result, gateway: this.paystack.gateway };
    } catch (primaryError) {
      this.logger.warn(
        `Paystack init failed, falling back to Flutterwave: ${
          primaryError instanceof Error ? primaryError.message : 'unknown'
        }`,
      );

      const result = await this.flutterwave.initialize(input);

      await this.prisma.paymentTransaction.update({
        where: { txnId },
        data: { gateway: this.flutterwave.gateway },
      });

      return { ...result, gateway: this.flutterwave.gateway };
    }
  }

  // Gateways require an email. Buyers auth by phone, so synthesise a stable,
  // non-routable address. Real receipts go by SMS.
  private syntheticEmail(phoneE164: string): string {
    const digits = phoneE164.replace(/\D/g, '');
    return `${digits}@buyers.surewina.ng`;
  }
}