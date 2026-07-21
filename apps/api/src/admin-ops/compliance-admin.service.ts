import { Injectable } from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config'

export type AuditSearchFilters = {
  action?: string;
  actorType?: AuditActorType;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  severity?: AuditSeverity;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class ComplianceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async searchAudit(f: AuditSearchFilters) {
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 50;

    const where: Prisma.AuditLogWhereInput = {
      ...(f.action ? { action: f.action } : {}),
      ...(f.actorType ? { actorType: f.actorType } : {}),
      ...(f.actorId ? { actorId: f.actorId } : {}),
      ...(f.resourceType ? { resourceType: f.resourceType } : {}),
      ...(f.resourceId ? { resourceId: f.resourceId } : {}),
      ...(f.severity ? { severity: f.severity } : {}),
      ...(f.fromDate || f.toDate
        ? {
            timestamp: {
              ...(f.fromDate ? { gte: new Date(f.fromDate) } : {}),
              ...(f.toDate ? { lte: endOfDay(f.toDate) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { entries: rows, total, page, pageSize };
  }

  // Daily operational summary in NLRC-friendly shape: draws executed with
  // their integrity artefacts, money in by channel, prizes out, claims state.
  async dailyReport(date: string) {
    const from = new Date(date);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 86_400_000);
    const range = { gte: from, lt: to };

    const [drawsExecuted, sales, claimsSettled, forfeited] = await Promise.all([
      this.prisma.draw.findMany({
        where: { status: DrawStatus.COMPLETED, executedAt: range },
        include: {
          result: {
            select: {
              winnerTicketRef: true,
              totalTicketsSold: true,
              totalEligibleParticipants: true,
              prizeValueNgn: true,
              rngSeedHash: true,
              merkleRoot: true,
              engineVersion: true,
              engineSignature: true,
              zeroInterventionConfirmed: true,
            },
          },
          seedCommit: { select: { committedAt: true } },
        },
      }),
      this.prisma.paymentTransaction.groupBy({
        by: ['gateway'],
        where: { status: PaymentStatus.CONFIRMED, confirmedAt: range },
        _sum: { amountNgn: true, ticketCount: true },
        _count: true,
      }),
      this.prisma.prizeClaim.findMany({
        where: { fulfilledAt: range },
        select: {
          claimId: true,
          winnerTicketRef: true,
          claimType: true,
          status: true,
          grossPrizeValueNgn: true,
          whtAmountNgn: true,
          netPrizeValueNgn: true,
        },
      }),
      this.prisma.prizeClaim.count({ where: { forfeitedAt: range } }),
    ]);

    return {
      reportDate: date,
      generatedAt: new Date().toISOString(),
      draws: drawsExecuted.map((d) => ({
        drawCode: d.drawCode,
        drawType: d.drawType,
        executedAt: d.executedAt?.toISOString() ?? null,
        seedCommittedAt: d.seedCommit?.committedAt.toISOString() ?? null,
        // The same artefacts the public verifier checks — report and
        // verification speak identical numbers by construction.
        integrity: d.result
          ? {
              winnerTicketRef: d.result.winnerTicketRef,
              participants: d.result.totalEligibleParticipants,
              ticketsSold: d.result.totalTicketsSold,
              prizeValueNgn: d.result.prizeValueNgn,
              rngSeedHash: d.result.rngSeedHash,
              merkleRoot: d.result.merkleRoot,
              engineVersion: d.result.engineVersion,
              engineSignature: d.result.engineSignature,
              zeroInterventionConfirmed: d.result.zeroInterventionConfirmed,
            }
          : null,
      })),
      salesByChannel: sales.map((s) => ({
        gateway: s.gateway,
        amountNgn: s._sum.amountNgn ?? 0,
        tickets: s._sum.ticketCount ?? 0,
        transactions: s._count,
      })),
      totalSalesNgn: sales.reduce((sum, s) => sum + (s._sum.amountNgn ?? 0), 0),
      prizesSettled: claimsSettled,
      totalWhtWithheldNgn: claimsSettled.reduce((s, c) => s + c.whtAmountNgn, 0),
      claimsForfeited: forfeited,
    };
  }

  // Statutory levy owed to each State Games Management Board, computed from
  // tickets' state of play. RATE IS PROVISIONAL (env-configurable) — confirm
  // the rate and remittance mechanics with the regulatory advisor before
  // treating these figures as amounts due.
  async levyReport(fromDate: string, toDate: string) {
    const from = new Date(fromDate);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(toDate);
    to.setUTCHours(23, 59, 59, 999);

    const ratePercent = Number(this.config.get('LEVY_RATE_PERCENT') ?? 2.5);
    const rate = ratePercent / 100;

    const rows = await this.prisma.ticket.groupBy({
      by: ['stateOfPlayCode'],
      where: { createdAt: { gte: from, lte: to } },
      _sum: { faceValueNgn: true },
      _count: true,
    });

    const states = rows
      .map((r) => {
        const salesNgn = r._sum.faceValueNgn ?? 0;
        return {
          stateCode: r.stateOfPlayCode,
          tickets: r._count,
          salesNgn,
          levyDueNgn: Math.round(salesNgn * rate),
        };
      })
      .sort((a, b) => b.salesNgn - a.salesNgn);

    return {
      fromDate,
      toDate,
      ratePercent,
      generatedAt: new Date().toISOString(),
      states,
      totals: {
        tickets: states.reduce((s, r) => s + r.tickets, 0),
        salesNgn: states.reduce((s, r) => s + r.salesNgn, 0),
        levyDueNgn: states.reduce((s, r) => s + r.levyDueNgn, 0),
      },
    };
  }

  // WHT remittance schedule: every deduction withheld in the period, as filed
  // with the tax authority. Rate/destination pending tax-advisor confirmation.
  async whtSchedule(fromDate: string, toDate: string) {
    const from = new Date(fromDate);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(toDate);
    to.setUTCHours(23, 59, 59, 999);

    const rows = await this.prisma.whtDeduction.findMany({
      where: { deductedAt: { gte: from, lte: to } },
      orderBy: { deductedAt: 'asc' },
    });

    return {
      fromDate,
      toDate,
      generatedAt: new Date().toISOString(),
      deductions: rows.map((d) => ({
        deductionRef: d.deductionRef,
        winnerTicketRef: d.winnerTicketRef,
        winnerPhone: d.winnerPhone,
        grossPrizeNgn: d.grossPrizeNgn,
        whtRatePercent: Number(d.whtRatePercent),
        whtAmountNgn: d.whtAmountNgn,
        netPrizeNgn: d.netPrizeNgn,
        deductedAt: d.deductedAt.toISOString(),
      })),
      totals: {
        deductions: rows.length,
        grossPrizeNgn: rows.reduce((s, d) => s + d.grossPrizeNgn, 0),
        whtPayableNgn: rows.reduce((s, d) => s + d.whtAmountNgn, 0),
      },
    };
  }

  private rangeOf(fromDate: string, toDate: string) {
    const from = new Date(fromDate);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(toDate);
    to.setUTCHours(23, 59, 59, 999);
    return { from, to };
  }

  async salesReport(fromDate: string, toDate: string) {
    const { from, to } = this.rangeOf(fromDate, toDate);

    const [byGateway, byState, byDay] = await Promise.all([
      this.prisma.paymentTransaction.groupBy({
        by: ['gateway'],
        where: { status: PaymentStatus.CONFIRMED, confirmedAt: { gte: from, lte: to } },
        _sum: { amountNgn: true, ticketCount: true },
        _count: true,
      }),
      this.prisma.ticket.groupBy({
        by: ['stateOfPlayCode'],
        where: { createdAt: { gte: from, lte: to } },
        _sum: { faceValueNgn: true },
        _count: true,
      }),
      this.prisma.$queryRaw<
        { day: Date; sales_ngn: string | null; tickets: string }[]
      >`SELECT date_trunc('day', created_at) AS day,
               SUM(face_value_ngn) AS sales_ngn,
               COUNT(*) AS tickets
        FROM tickets
        WHERE created_at >= ${from} AND created_at <= ${to}
        GROUP BY 1 ORDER BY 1`,
    ]);

    return {
      fromDate,
      toDate,
      generatedAt: new Date().toISOString(),
      byGateway: byGateway.map((g) => ({
        gateway: g.gateway,
        transactions: g._count,
        tickets: g._sum.ticketCount ?? 0,
        amountNgn: g._sum.amountNgn ?? 0,
      })),
      byState: byState
        .map((s) => ({
          stateCode: s.stateOfPlayCode,
          tickets: s._count,
          salesNgn: s._sum.faceValueNgn ?? 0,
        }))
        .sort((a, b) => b.salesNgn - a.salesNgn),
      byDay: byDay.map((d) => ({
        day: d.day.toISOString().slice(0, 10),
        tickets: Number(d.tickets),
        salesNgn: Number(d.sales_ngn ?? 0),
      })),
      totals: {
        salesNgn: byState.reduce((s, r) => s + (r._sum.faceValueNgn ?? 0), 0),
        tickets: byState.reduce((s, r) => s + r._count, 0),
      },
    };
  }

  // Operating P&L from ledger data. Accrual-approximate ops reporting — the
  // statutory books come from the accountant, not this endpoint.
  async financialReport(fromDate: string, toDate: string) {
    const { from, to } = this.rangeOf(fromDate, toDate);
    const levyRate = Number(this.config.get('LEVY_RATE_PERCENT') ?? 2.5) / 100;

    const [sales, prizes, wht, commission] = await Promise.all([
      this.prisma.paymentTransaction.aggregate({
        where: { status: PaymentStatus.CONFIRMED, confirmedAt: { gte: from, lte: to } },
        _sum: { amountNgn: true },
        _count: true,
      }),
      this.prisma.prizeClaim.aggregate({
        where: { fulfilledAt: { gte: from, lte: to } },
        _sum: { grossPrizeValueNgn: true },
        _count: true,
      }),
      this.prisma.whtDeduction.aggregate({
        where: { deductedAt: { gte: from, lte: to } },
        _sum: { whtAmountNgn: true },
      }),
      this.prisma.commissionDisbursement.aggregate({
        where: { createdAt: { gte: from, lte: to } },
        _sum: { amountNgn: true },
        _count: true,
      }),
    ]);

    const grossSalesNgn = sales._sum.amountNgn ?? 0;
    const prizesGrossNgn = prizes._sum.grossPrizeValueNgn ?? 0;
    const commissionNgn = commission._sum.amountNgn ?? 0;
    const levyAccruedNgn = Math.round(grossSalesNgn * levyRate);

    return {
      fromDate,
      toDate,
      generatedAt: new Date().toISOString(),
      revenue: { grossSalesNgn, transactions: sales._count },
      costs: {
        prizesGrossNgn,
        prizesSettled: prizes._count,
        commissionNgn,
        commissionCount: commission._count,
        levyAccruedNgn,
        levyRatePercent: levyRate * 100,
      },
      memo: {
        // Withheld from winners, owed onward to the tax authority — a
        // liability pass-through, not a cost line.
        whtWithheldNgn: wht._sum.whtAmountNgn ?? 0,
      },
      net: {
        grossMarginNgn: grossSalesNgn - prizesGrossNgn - commissionNgn - levyAccruedNgn,
      },
    };
  }

  // Agent ranking by sales in the period. Commission column is an estimate
  // (rate × sales) — authoritative figures live in disbursement records.
  async agentPerformance(fromDate: string, toDate: string) {
    const { from, to } = this.rangeOf(fromDate, toDate);

    const grouped = await this.prisma.ticket.groupBy({
      by: ['agentId'],
      where: { agentId: { not: null }, createdAt: { gte: from, lte: to } },
      _sum: { faceValueNgn: true },
      _count: true,
    });

    const agentIds = grouped.map((g) => g.agentId as string);
    const agents = await this.prisma.agent.findMany({
      where: { agentId: { in: agentIds } },
      select: {
        agentId: true,
        agentCode: true,
        fullName: true,
        tier: true,
        status: true,
        commissionRate: true,
        registeredStateCode: true,
      },
    });
    const byId = new Map(agents.map((a) => [a.agentId, a]));

    const rows = grouped
      .map((g) => {
        const a = byId.get(g.agentId as string);
        const salesNgn = g._sum.faceValueNgn ?? 0;
        const rate = a ? Number(a.commissionRate) : 0;
        return {
          agentId: g.agentId as string,
          agentCode: a?.agentCode ?? 'UNKNOWN',
          fullName: a?.fullName ?? 'Unknown agent',
          tier: a?.tier ?? null,
          status: a?.status ?? null,
          stateCode: a?.registeredStateCode ?? null,
          tickets: g._count,
          salesNgn,
          commissionRatePercent: Math.round(rate * 10000) / 100,
          estCommissionNgn: Math.round(salesNgn * rate),
        };
      })
      .sort((a, b) => b.salesNgn - a.salesNgn);

    return {
      fromDate,
      toDate,
      generatedAt: new Date().toISOString(),
      agents: rows,
      totals: {
        activeSellers: rows.length,
        tickets: rows.reduce((s, r) => s + r.tickets, 0),
        salesNgn: rows.reduce((s, r) => s + r.salesNgn, 0),
        estCommissionNgn: rows.reduce((s, r) => s + r.estCommissionNgn, 0),
      },
    };
  }
}


function endOfDay(iso: string): Date {
  const d = new Date(iso);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}