import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';

type ReceiptTokenPayload = { txnId: string; type: 'receipt' };

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
      { txnId, type: 'receipt' } satisfies ReceiptTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: RECEIPT_TTL,
      },
    );
  }

  async receiptUrl(txnId: string): Promise<string> {
    const base =
      this.config.get<string>('PUBLIC_WEB_BASE_URL') ?? 'http://localhost:3000';
    return `${base}/receipt/${await this.signToken(txnId)}`;
  }

  // Public: the token is the credential. Returns only what a printed ticket
  // shows — no payout details, no account data.
  async byToken(token: string) {
    let payload: ReceiptTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<ReceiptTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('This receipt link has expired or is not valid');
    }

    if (payload.type !== 'receipt') {
      throw new UnauthorizedException('Invalid receipt link');
    }

    const txn = await this.prisma.paymentTransaction.findUnique({
      where: { txnId: payload.txnId },
      include: {
        tickets: {
          select: { ticketRef: true, faceValueNgn: true },
          orderBy: { createdAt: 'asc' },
        },
        agent: { select: { terminalNumber: true } },
      },
    });
    if (!txn || txn.tickets.length === 0) {
      throw new NotFoundException('Receipt not found');
    }

    const draw = await this.prisma.draw.findFirst({
      where: { tickets: { some: { paymentTxnId: txn.txnId } } },
      select: {
        drawNumber: true,
        drawType: true,
        scheduledAt: true,
        cutoffAt: true,
        ticketPriceNgn: true,
      },
    });
    if (!draw) throw new NotFoundException('Draw not found for this receipt');

    return {
      terminal: txn.agent?.terminalNumber
        ? String(txn.agent.terminalNumber).padStart(6, '0')
        : 'ONLINE',
      drawNumber: String(draw.drawNumber).padStart(4, '0'),
      drawType: draw.drawType,
      scheduledAt: draw.scheduledAt.toISOString(),
      cutoffAt: draw.cutoffAt.toISOString(),
      soldAt: (txn.confirmedAt ?? txn.createdAt).toISOString(),
      ticketPriceNgn: draw.ticketPriceNgn,
      amountNgn: txn.amountNgn,
      tickets: txn.tickets.map((t) => t.ticketRef),
      // Masked: enough for the holder to recognise as theirs, useless to
      // anyone who intercepts the link.
      buyerPhone: `${txn.buyerPhone.slice(0, 4)}****${txn.buyerPhone.slice(-4)}`,
    };
  }
}