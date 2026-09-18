import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../database/prisma.service';

type ReceiptTokenPayload =
  | {
      txnId: string;
      type: 'receipt';
    }
  | {
      walletPurchaseId: string;
      type: 'wallet-receipt';
    };

// A receipt link is a bearer credential in an email, so it's signed rather
// than guessable, and expires. 30 days matches the claim window: if the
// ticket wins, the link still works for as long as the prize can be claimed.
const RECEIPT_TTL = '30d';

@Injectable()
export class ReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signToken(txnId: string): Promise<string> {
    return this.jwt.signAsync(
      {
        txnId,
        type: 'receipt',
      } satisfies ReceiptTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: RECEIPT_TTL,
      },
    );
  }

  async receiptUrl(txnId: string): Promise<string> {
    const base =
      this.config.get<string>('PUBLIC_WEB_BASE_URL') ??
      'http://localhost:3000';

    return `${base}/receipt/${await this.signToken(txnId)}`;
  }

  async walletPurchaseReceiptUrl(
    walletPurchaseId: string,
  ): Promise<string> {
    const base =
      this.config.get<string>('PUBLIC_WEB_BASE_URL') ??
      'http://localhost:3000';

    const token = await this.jwt.signAsync(
      {
        walletPurchaseId,
        type: 'wallet-receipt',
      } satisfies ReceiptTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: RECEIPT_TTL,
      },
    );

    return `${base}/receipt/${token}`;
  }

  // Public: the token is the credential.
  // Returns only what a printed ticket shows:
  // no payout details and no private account data.
  async byToken(token: string) {
    let payload: ReceiptTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<ReceiptTokenPayload>(
        token,
        {
          secret:
            this.config.getOrThrow<string>(
              'JWT_ACCESS_SECRET',
            ),
        },
      );
    } catch {
      throw new UnauthorizedException(
        'This receipt link has expired or is not valid',
      );
    }

    /*
     * Wallet purchase receipt.
     *
     * Handle this BEFORE the legacy PaymentTransaction path
     * so TypeScript correctly narrows the token union.
     */
    if (payload.type === 'wallet-receipt') {
      return this.walletReceipt(
        payload.walletPurchaseId,
      );
    }

    /*
     * Legacy provider / agent payment receipt.
     *
     * At this point TypeScript knows payload.type === 'receipt',
     * therefore payload.txnId is safe to access.
     */
    if (payload.type === 'receipt') {
      return this.paymentReceipt(
        payload.txnId,
      );
    }

    /*
     * Defensive fallback in case the JWT payload is malformed
     * or a future receipt type is introduced without support here.
     */
    throw new UnauthorizedException(
      'Invalid receipt link',
    );
  }

  private async walletReceipt(
    walletPurchaseId: string,
  ) {
    const purchase =
      await this.prisma.walletPurchase.findUnique({
        where: {
          purchaseId: walletPurchaseId,
        },
        include: {
          draw: true,
          tickets: {
            select: {
              ticketRef: true,
              faceValueNgn: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

    if (
      !purchase ||
      purchase.tickets.length === 0
    ) {
      throw new NotFoundException(
        'Receipt not found',
      );
    }

    return {
      terminal: 'ONLINE',

      drawNumber:
        String(
          purchase.draw.drawNumber,
        ).padStart(4, '0'),

      drawType:
        purchase.draw.drawType,

      scheduledAt:
        purchase.draw.scheduledAt.toISOString(),

      cutoffAt:
        purchase.draw.cutoffAt.toISOString(),

      soldAt:
        (
          purchase.completedAt ??
          purchase.createdAt
        ).toISOString(),

      ticketPriceNgn:
        purchase.draw.ticketPriceNgn,

      amountNgn:
        purchase.amountNgn,

      tickets:
        purchase.tickets.map(
          (ticket) =>
            ticket.ticketRef,
        ),

      buyerPhone:
        this.maskPhone(
          purchase.buyerPhone,
        ),
    };
  }

  private async paymentReceipt(
    txnId: string,
  ) {
    const txn =
      await this.prisma.paymentTransaction.findUnique({
        where: {
          txnId,
        },
        include: {
          tickets: {
            select: {
              ticketRef: true,
              faceValueNgn: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
          agent: {
            select: {
              terminalNumber: true,
            },
          },
        },
      });

    if (
      !txn ||
      txn.tickets.length === 0
    ) {
      throw new NotFoundException(
        'Receipt not found',
      );
    }

    const draw =
      await this.prisma.draw.findFirst({
        where: {
          tickets: {
            some: {
              paymentTxnId:
                txn.txnId,
            },
          },
        },
        select: {
          drawNumber: true,
          drawType: true,
          scheduledAt: true,
          cutoffAt: true,
          ticketPriceNgn: true,
        },
      });

    if (!draw) {
      throw new NotFoundException(
        'Draw not found for this receipt',
      );
    }

    return {
      terminal:
        txn.agent?.terminalNumber
          ? String(
              txn.agent.terminalNumber,
            ).padStart(6, '0')
          : 'ONLINE',

      drawNumber:
        String(
          draw.drawNumber,
        ).padStart(4, '0'),

      drawType:
        draw.drawType,

      scheduledAt:
        draw.scheduledAt.toISOString(),

      cutoffAt:
        draw.cutoffAt.toISOString(),

      soldAt:
        (
          txn.confirmedAt ??
          txn.createdAt
        ).toISOString(),

      ticketPriceNgn:
        draw.ticketPriceNgn,

      amountNgn:
        txn.amountNgn,

      tickets:
        txn.tickets.map(
          (ticket) =>
            ticket.ticketRef,
        ),

      buyerPhone:
        this.maskPhone(
          txn.buyerPhone,
        ),
    };
  }

  private maskPhone(
    phone: string,
  ): string {
    if (phone.length <= 8) {
      return '****';
    }

    return `${phone.slice(0, 4)}****${phone.slice(-4)}`;
  }
}