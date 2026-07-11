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

@Injectable()
export class AgentRemittanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async current(agentId: string) {
    const open = await this.prisma.remittance.findMany({
      where: {
        agentId,
        status: { in: [RemittanceStatus.PENDING, RemittanceStatus.AGENT_CONFIRMED, RemittanceStatus.LATE] },
      },
      orderBy: { periodDate: 'asc' },
    });
    const totalOwedNgn = open
      .filter((r) => r.status !== RemittanceStatus.AGENT_CONFIRMED)
      .reduce((s, r) => s + r.amountDueNgn, 0);
    return { totalOwedNgn, remittances: open.map(this.toView) };
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

  async commissionSummary(agentId: string) {
    const disbursements = await this.prisma.commissionDisbursement.findMany({
      where: { agentId },
      orderBy: { periodDate: 'desc' },
      take: 30,
    });
    const totalPaidNgn = disbursements
      .filter((d) => d.status === 'INITIATED' || d.status === 'SETTLED')
      .reduce((s, d) => s + d.amountNgn, 0);
    return {
      totalPaidNgn,
      disbursements: disbursements.map((d) => ({
        periodDate: d.periodDate.toISOString().slice(0, 10),
        amountNgn: d.amountNgn,
        status: d.status,
        payoutReference: d.payoutReference,
      })),
    };
  }

  private toView = (r: {
    remittanceId: string; periodDate: Date; grossSalesNgn: number;
    commissionNgn: number; amountDueNgn: number; ticketCount: number;
    status: RemittanceStatus; bankTransferRef: string | null;
  }) => ({
    remittanceId: r.remittanceId,
    periodDate: r.periodDate.toISOString().slice(0, 10),
    grossSalesNgn: r.grossSalesNgn,
    commissionNgn: r.commissionNgn,
    amountDueNgn: r.amountDueNgn,
    ticketCount: r.ticketCount,
    status: r.status,
    bankTransferRef: r.bankTransferRef,
  });
}