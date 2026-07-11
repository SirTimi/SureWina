import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentStatus,
  AuditActorType,
  AuditSeverity,
  PaymentGateway,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

export type AgentAction = 'APPROVE' | 'SUSPEND' | 'REACTIVATE' | 'TERMINATE';

// Legal transitions. TERMINATED is terminal — rehiring is a new record.
const TRANSITIONS: Record<AgentAction, { from: AgentStatus[]; to: AgentStatus }> = {
  APPROVE: { from: [AgentStatus.PENDING_KYC], to: AgentStatus.ACTIVE },
  SUSPEND: { from: [AgentStatus.ACTIVE], to: AgentStatus.SUSPENDED },
  REACTIVATE: { from: [AgentStatus.SUSPENDED], to: AgentStatus.ACTIVE },
  TERMINATE: {
    from: [AgentStatus.ACTIVE, AgentStatus.SUSPENDED],
    to: AgentStatus.TERMINATED,
  },
};

const AUDIT_ACTIONS: Record<AgentAction, string> = {
  APPROVE: 'AGENT_APPROVED',
  SUSPEND: 'AGENT_SUSPENDED',
  REACTIVATE: 'AGENT_REACTIVATED',
  TERMINATE: 'AGENT_TERMINATED',
};

@Injectable()
export class AgentAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(status?: AgentStatus, page = 1, pageSize = 20) {
    const where: Prisma.AgentWhereInput = status ? { status } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.agent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          agentId: true,
          agentCode: true,
          fullName: true,
          phoneNumber: true,
          registeredStateCode: true,
          status: true,
          tier: true,
          commissionRate: true,
          createdAt: true,
        },
      }),
      this.prisma.agent.count({ where }),
    ]);
    return { agents: rows, total, page, pageSize };
  }

  async detail(agentId: string) {
    const agent = await this.prisma.agent.findUnique({ where: { agentId } });
    if (!agent) throw new NotFoundException('Agent not found');

    const [lifetimeSales, openRemittances, lastSale] = await Promise.all([
      this.prisma.paymentTransaction.aggregate({
        where: {
          agentId,
          gateway: PaymentGateway.AGENT_CASH,
          status: PaymentStatus.CONFIRMED,
        },
        _sum: { amountNgn: true, ticketCount: true },
        _count: true,
      }),
      this.prisma.remittance.findMany({
        where: { agentId, status: { in: ['PENDING', 'AGENT_CONFIRMED', 'LATE'] } },
        select: { periodDate: true, amountDueNgn: true, status: true },
      }),
      this.prisma.paymentTransaction.findFirst({
        where: { agentId, gateway: PaymentGateway.AGENT_CASH },
        orderBy: { confirmedAt: 'desc' },
        select: { confirmedAt: true },
      }),
    ]);

    const { bvnHash: _bvn, ...safeAgent } = agent; // never surface the hash
    return {
      agent: safeAgent,
      lifetime: {
        grossSalesNgn: lifetimeSales._sum.amountNgn ?? 0,
        ticketsSold: lifetimeSales._sum.ticketCount ?? 0,
        saleCount: lifetimeSales._count,
        lastSaleAt: lastSale?.confirmedAt?.toISOString() ?? null,
      },
      openRemittances: openRemittances.map((r) => ({
        periodDate: r.periodDate.toISOString().slice(0, 10),
        amountDueNgn: r.amountDueNgn,
        status: r.status,
      })),
      outstandingNgn: openRemittances.reduce((s, r) => s + r.amountDueNgn, 0),
    };
  }

  async transition(
    agentId: string,
    action: AgentAction,
    adminId: string,
    reason?: string,
  ) {
    const rule = TRANSITIONS[action];
    const agent = await this.prisma.agent.findUnique({ where: { agentId } });
    if (!agent) throw new NotFoundException('Agent not found');
    if (!rule.from.includes(agent.status)) {
      throw new ConflictException(
        `Cannot ${action} an agent in status ${agent.status}`,
      );
    }

    // Guarded flip: concurrent admin actions serialise into one winner.
    const result = await this.prisma.agent.updateMany({
      where: { agentId, status: { in: rule.from } },
      data: { status: rule.to },
    });
    if (result.count === 0) {
      throw new ConflictException('Agent status changed concurrently — retry');
    }

    await this.audit.write({
      severity:
        action === 'TERMINATE' || action === 'SUSPEND'
          ? AuditSeverity.WARNING
          : AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: AUDIT_ACTIONS[action],
      resource: { type: 'Agent', id: agentId },
      metadata: {
        agentCode: agent.agentCode,
        from: agent.status,
        to: rule.to,
        reason: reason ?? null,
      },
    });

    return { agentId, agentCode: agent.agentCode, status: rule.to };
  }
}