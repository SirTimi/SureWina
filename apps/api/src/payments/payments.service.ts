import {
  BadRequestException,
  ConflictException,
  Inject,
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
  PaymentStatus,
  PurchaseChannel,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayDriver,
} from './gateway/payment-gateway.interface';
import { InitiatePurchaseDto } from './dto/initiate-purchase.dto';

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
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGatewayDriver,
  ) {}

  async initiatePurchase(
    dto: InitiatePurchaseDto,
  ): Promise<InitiatePurchaseResult> {
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
    //    Prefixed so it's obvious in the Paystack dashboard.
    const reference = `SW-PAY-${randomUUID()}`;

    // 4. Create the PENDING transaction BEFORE calling the gateway, so a
    //    webhook can never arrive for a txn we don't have on record.
    const txn = await this.prisma.paymentTransaction.create({
      data: {
        gatewayReference: reference,
        gateway: this.gateway.gateway,
        amountNgn,
        buyerPhone: dto.phoneE164,
        channel: PurchaseChannel.DIRECT,
        ticketCount: dto.quantity,
        status: PaymentStatus.PENDING,
      },
    });

    // 5. Call the gateway. If it fails, mark the txn FAILED and surface it.
    try {
      const init = await this.gateway.initialize({
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
          gateway: this.gateway.gateway,
        },
      });

      this.logger.log(
        `Payment initiated: ${reference} (${amountNgn} NGN, draw ${dto.drawCode})`,
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

  // Paystack requires an email. Buyers auth by phone, so synthesise a stable,
  // non-routable address. Real receipts go by SMS.
  private syntheticEmail(phoneE164: string): string {
    const digits = phoneE164.replace(/\D/g, '');
    return `${digits}@buyers.surewina.ng`;
  }
}