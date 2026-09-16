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
  Prisma,
  PrizeClaimStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

// Draw states in which a purchase may still be refunded. Once COMPLETED,
// outcomes are known and refunds become dispute-resolution, not finance ops.
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

  // Prize payouts: cash claims paid via app transfer or agent cash.
// Read-only record view. The payout provider is stored per claim so
// Finance can distinguish DEV, MONNIFY, FLUTTERWAVE, etc.
  async listPayouts(f: {
    status?: PrizeClaimStatus;
    fromDate?: string;
    toDate?: string;
  }) {
    const where: Prisma.PrizeClaimWhereInput = {
  OR: [
    {
      payoutStatus: {
        not: null,
      },
    },
    {
      payoutReference: {
        not: null,
      },
    },
  ],

  ...(f.status ? { status: f.status } : {}),

  ...(f.fromDate || f.toDate
    ? {
        payoutInitiatedAt: {
          ...(f.fromDate
            ? { gte: new Date(f.fromDate) }
            : {}),
          ...(f.toDate
            ? {
                lte: new Date(
                  `${f.toDate}T23:59:59.999Z`,
                ),
              }
            : {}),
        },
      }
    : {}),
};

      const rows =
        await this.prisma.prizeClaim.findMany({
          where,

          orderBy: {
            payoutInitiatedAt: 'desc',
          },

          take: 200,

          select: {
            claimId: true,
            winnerTicketRef: true,
            winnerPhone: true,

            status: true,
            claimType: true,

            grossPrizeValueNgn: true,
            whtAmountNgn: true,
            netPrizeValueNgn: true,

            payoutStatus: true,
            payoutProvider: true,
            payoutReference: true,

            // Selected for operational/reconciliation use.
            // We intentionally do not return it to the normal admin UI below.
            payoutIdempotencyKey: true,

            payoutInitiatedAt: true,
            payoutAccountNumber: true,

            fulfilledAt: true,
          },
        });

        return {
        payouts: rows.map((r) => ({
          claimId: r.claimId,

          winnerTicketRef: r.winnerTicketRef,
          winnerPhone: r.winnerPhone,

          status: r.status,
          claimType: r.claimType,

          grossPrizeValueNgn:
            r.grossPrizeValueNgn,

          whtAmountNgn:
            r.whtAmountNgn,

          netPrizeValueNgn:
            r.netPrizeValueNgn,

          payoutStatus:
            r.payoutStatus,

          payoutProvider:
            r.payoutProvider,

          payoutReference:
            r.payoutReference,

          channel:
            r.payoutReference?.startsWith(
              'AGT-CASH-',
            )
              ? 'AGENT_CASH'
              : 'BANK_TRANSFER',

          payoutInitiatedAt:
            r.payoutInitiatedAt?.toISOString() ??
            null,

          accountLast4:
            r.payoutAccountNumber?.slice(-4) ??
            null,

          fulfilledAt:
            r.fulfilledAt?.toISOString() ??
            null,
        })),

        totals: {
          count: rows.length,

          grossNgn: rows.reduce(
            (sum, r) =>
              sum + r.grossPrizeValueNgn,
            0,
          ),

        /*
        * Only claims that actually reached CASH_PAID
        * count as paid.
        *
        * REQUESTED / SUBMITTED / PROCESSING /
        * UNKNOWN must never inflate paid totals.
        */
        netPaidNgn: rows
          .filter(
            (r) =>
              r.status ===
              PrizeClaimStatus.CASH_PAID,
          )
          .reduce(
            (sum, r) =>
              sum + r.netPrizeValueNgn,
            0,
          ),
      },
    };
  }
}