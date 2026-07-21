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
}


function endOfDay(iso: string): Date {
  const d = new Date(iso);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}