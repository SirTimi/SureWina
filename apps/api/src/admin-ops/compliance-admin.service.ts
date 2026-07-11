import { Injectable } from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
}

function endOfDay(iso: string): Date {
  const d = new Date(iso);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}