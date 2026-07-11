import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditActorType,
  AuditSeverity,
  DisbStatus,
  DrawStatus,
  PaymentStatus,
  TicketStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

// Draw states in which a purchase may still be refunded. Once COMPLETED,
// outcomes are known and refunds become dispute-resolution, not finance ops.
const REFUNDABLE_DRAW_STATES: DrawStatus[] = [
  DrawStatus.SCHEDULED,
  DrawStatus.ACTIVE,
  DrawStatus.SALES_CLOSED,
  DrawStatus.CANCELLED,
];

@Injectable()
export class FinanceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  // Reconciliation: confirmed money by gateway for a given UTC day range.
  async reconciliation(fromDate: string, toDate: string) {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setUTCHours(23, 59, 59, 999);

    const byGateway = await this.prisma.paymentTransaction.groupBy({
      by: ['gateway', 'status'],
      where: { createdAt: { gte: from, lte: to } },
      _sum: { amountNgn: true, ticketCount: true },
      _count: true,
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      rows: byGateway.map((g) => ({
        gateway: g.gateway,
        status: g.status,
        amountNgn: g._sum.amountNgn ?? 0,
        tickets: g._sum.ticketCount ?? 0,
        transactions: g._count,
      })),
    };
  }

  async refund(txnId: string, adminId: string, reason: string) {
    const txn = await this.prisma.paymentTransaction.findUnique({
      where: { txnId },
      include: { tickets: { select: { ticketId: true, drawId: true, isWinner: true } } },
    });
    if (!txn) throw new NotFoundException('Transaction not found');
    if (txn.status !== PaymentStatus.CONFIRMED) {
      throw new ConflictException(`Only CONFIRMED payments can be refunded (is ${txn.status})`);
    }
    if (txn.tickets.some((t) => t.isWinner)) {
      throw new ConflictException('Transaction contains a winning ticket — cannot refund');
    }

    // Every ticket's draw must still be in a refundable state.
    const drawIds = [...new Set(txn.tickets.map((t) => t.drawId))];
    const draws = await this.prisma.draw.findMany({
      where: { drawId: { in: drawIds } },
      select: { drawCode: true, status: true },
    });
    const locked = draws.filter((d) => !REFUNDABLE_DRAW_STATES.includes(d.status));
    if (locked.length > 0) {
      throw new ConflictException(
        `Draw(s) already executed: ${locked.map((d) => d.drawCode).join(', ')} — refund via dispute process`,
      );
    }

    // Dev-mode money movement; real gateway refund call slots in here.
    const refundRef =
      (this.config.get<string>('REFUNDS_MODE') ?? 'dev') === 'dev'
        ? `DEV-REFUND-${randomUUID()}`
        : (() => {
            throw new ConflictException('Paystack refund mode not yet implemented');
          })();

    // Atomic: payment flips + all tickets voided together.
    await this.prisma.$transaction([
      this.prisma.paymentTransaction.update({
        where: { txnId },
        data: { status: PaymentStatus.REFUNDED, failureReason: `REFUND: ${reason}` },
      }),
      this.prisma.ticket.updateMany({
        where: { paymentTxnId: txnId },
        data: { status: TicketStatus.EXPIRED },
      }),
    ]);

    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'PAYMENT_REFUNDED',
      resource: { type: 'PaymentTransaction', id: txnId },
      metadata: {
        reference: txn.gatewayReference,
        amountNgn: txn.amountNgn,
        ticketsVoided: txn.tickets.length,
        refundRef,
        reason,
      },
    });

    return { txnId, refunded: true, refundRef, ticketsVoided: txn.tickets.length };
  }

  async retryCommission(disbId: string, adminId: string) {
    const disb = await this.prisma.commissionDisbursement.findUnique({
      where: { disbId },
      include: { agent: { select: { agentCode: true } } },
    });
    if (!disb) throw new NotFoundException('Disbursement not found');
    if (disb.status !== DisbStatus.FAILED) {
      throw new ConflictException(`Only FAILED disbursements can be retried (is ${disb.status})`);
    }

    const reference = `DEV-COMM-RETRY-${randomUUID()}`;
    const updated = await this.prisma.commissionDisbursement.update({
      where: { disbId },
      data: {
        status: DisbStatus.INITIATED,
        payoutReference: reference,
        initiatedAt: new Date(),
      },
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'COMMISSION_RETRIED',
      resource: { type: 'CommissionDisbursement', id: disbId },
      metadata: { agentCode: disb.agent.agentCode, amountNgn: disb.amountNgn, reference },
    });

    return updated;
  }
}