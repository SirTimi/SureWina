import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  RemittanceStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WalletService } from '../wallet/wallet.service';
import { AgentAccountingService } from './agent-accounting.service';

@Injectable()
export class AgentRemittanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallets: WalletService,
    private readonly agentAccounting: AgentAccountingService,
  ) {}

  async current(agentId: string) {
    const [wallet, open] = await Promise.all([
      this.wallets.ensureAgentWallet(agentId),
      this.prisma.remittance.findMany({
        where: {
          agentId,
          status: {
            in: [
              RemittanceStatus.PENDING,
              RemittanceStatus.AGENT_CONFIRMED,
              RemittanceStatus.LATE,
            ],
          },
        },
        orderBy: { periodDate: 'asc' },
      }),
    ]);

    const totalOwedNgn = open
      .filter(
        (r) =>
          r.status !== RemittanceStatus.AGENT_CONFIRMED &&
          r.amountDueNgn > 0,
      )
      .reduce((sum, r) => sum + r.amountDueNgn, 0);

    return {
      totalOwedNgn,
      walletBalanceNgn: wallet.availableNgn,
      remittances: open.map(this.toView),
    };
  }

  async history(agentId: string, page = 1, pageSize = 20) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.remittance.findMany({
        where: { agentId },
        orderBy: { periodDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.remittance.count({ where: { agentId } }),
    ]);
    return { remittances: rows.map(this.toView), total, page, pageSize };
  }

  async confirmPayment(agentId: string, remittanceId: string, bankTransferRef: string) {
    const rem = await this.prisma.remittance.findFirst({
      where: { remittanceId, agentId },
    });
    if (!rem) throw new NotFoundException('Remittance not found');

    // Nothing to pay on a credit day — the agent's prize payouts covered
    // their sales. Without this an agent could file a bank reference against
    // a negative amount and appear to have settled a debt that never existed.
    if (rem.amountDueNgn <= 0) {
      throw new ConflictException(
        'Nothing to remit for this day — your prize payouts covered your sales.',
      );
    }

    if (rem.status !== RemittanceStatus.PENDING && rem.status !== RemittanceStatus.LATE) {
      throw new ConflictException(`Remittance is ${rem.status}`);
    }

    const updated = await this.prisma.remittance.update({
      where: { remittanceId },
      data: {
        status: RemittanceStatus.AGENT_CONFIRMED,
        bankTransferRef,
        agentConfirmedAt: new Date(),
      },
    });
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.AGENT, id: agentId },
      action: 'REMITTANCE_AGENT_CONFIRMED',
      resource: { type: 'Remittance', id: remittanceId },
      metadata: { bankTransferRef, amountDueNgn: rem.amountDueNgn },
    });
    return this.toView(updated);
  }

  // Settle a day's remittance out of wallet credit rather than a bank
  // transfer. Explicit rather than automatic: an agent should decide when to
  // spend their credit, not discover after the fact that it was consumed.
  async settleFromWallet(agentId: string, remittanceId: string) {
    const settled =
      await this.agentAccounting.settleRemittanceFromWallet(
        agentId,
        remittanceId,
      );

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.AGENT, id: agentId },
      action: 'REMITTANCE_SETTLED_FROM_WALLET',
      resource: { type: 'Remittance', id: remittanceId },
      metadata: {
        amountDueNgn: settled.amountDueNgn,
        settlementLedgerTxnId: settled.settlementLedgerTxnId,
      },
    });

    return this.toView(settled);
  }

  // Net model: commission never transfers — the agent keeps it from the cash
  // at the point of sale. The settled record is therefore the commission line
  // on each day's remittance, not a disbursement.
  //
  // Each row is the agent's immutable record for that day: what was sold, in
  // what mix, what they kept, what they paid out, and what they owed. Read
  // from the snapshot, never recomputed — a ticket voided later must not
  // rewrite a closed day.
  async commissionSummary(agentId: string) {
    const rows = await this.prisma.remittance.findMany({
      where: { agentId },
      orderBy: { periodDate: 'desc' },
      take: 30,
      select: {
        periodDate: true,
        ticketCount: true,
        standardTicketCount: true,
        jackpotTicketCount: true,
        grossSalesNgn: true,
        standardSalesNgn: true,
        jackpotSalesNgn: true,
        commissionNgn: true,
        winningsPaidOutNgn: true,
        amountDueNgn: true,
        status: true,
      },
    });

    // Earned at the moment of sale, since it never leaves the till. No
    // status filter: unlike a disbursement, there is no state in which the
    // agent is holding commission they have not yet received.
    const totalEarnedNgn = rows.reduce((s, r) => s + r.commissionNgn, 0);

    return {
      totalEarnedNgn,
      periods: rows.map((r) => ({
        periodDate: r.periodDate.toISOString().slice(0, 10),
        ticketCount: r.ticketCount,
        standardTicketCount: r.standardTicketCount,
        jackpotTicketCount: r.jackpotTicketCount,
        grossSalesNgn: r.grossSalesNgn,
        standardSalesNgn: r.standardSalesNgn,
        jackpotSalesNgn: r.jackpotSalesNgn,
        commissionNgn: r.commissionNgn,
        winningsPaidOutNgn: r.winningsPaidOutNgn,
        amountDueNgn: r.amountDueNgn,
        remittanceStatus: r.status,
      })),
    };
  }

  private toView = (r: {
    remittanceId: string; periodDate: Date; grossSalesNgn: number;
    commissionNgn: number; amountDueNgn: number; ticketCount: number;
    standardTicketCount: number; jackpotTicketCount: number;
    standardSalesNgn: number; jackpotSalesNgn: number;
    winningsPaidOutNgn: number;
    status: RemittanceStatus; bankTransferRef: string | null;
  }) => ({
    remittanceId: r.remittanceId,
    periodDate: r.periodDate.toISOString().slice(0, 10),
    grossSalesNgn: r.grossSalesNgn,
    commissionNgn: r.commissionNgn,
    amountDueNgn: r.amountDueNgn,
    ticketCount: r.ticketCount,
    standardTicketCount: r.standardTicketCount,
    jackpotTicketCount: r.jackpotTicketCount,
    standardSalesNgn: r.standardSalesNgn,
    jackpotSalesNgn: r.jackpotSalesNgn,
    winningsPaidOutNgn: r.winningsPaidOutNgn,
    status: r.status,
    bankTransferRef: r.bankTransferRef,
  });
}