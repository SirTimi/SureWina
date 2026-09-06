import {
  ConflictException,
  Injectable,
  Logger,
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
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IdentityVerificationService } from '../agent-ops/kyc/identity-verification.service';
import { ZohoEmailProvider } from '../notifications/zoho-email.provider';
import { agentOnboardingPending } from '../notifications/email.templates';

export type AgentAction = 'APPROVE' | 'SUSPEND' | 'REACTIVATE' | 'TERMINATE';

// Shape captured at in-office onboarding. The controller's DTO validates it;
// this type is what the service consumes.
export type OnboardAgentInput = {
  fullName: string;
  phoneNumber: string;
  email: string;
  registeredStateCode: string;
  nin: string;
  bvn: string;
  idDocType: string;
  onboardingNote?: string;
};

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

  private readonly logger = new Logger(AgentAdminService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly identity: IdentityVerificationService,
    private readonly email: ZohoEmailProvider,
  ) {}

    // Search matches terminal number, agent code, name or phone. Terminal is
  // the one staff actually have to hand — it is printed on every ticket, so
  // a customer query or a dispute usually starts from that number rather
  // than from anything else we hold.
  async list(status?: AgentStatus, search?: string, page = 1, pageSize = 20) {
    const term = search?.trim();

    const where: Prisma.AgentWhereInput = {
      ...(status ? { status } : {}),
      ...(term
        ? {
            OR: [
              // Terminal is stored as an integer but printed zero-padded to
              // six digits, so "000042" and "42" must both find agent 42.
              ...(/^\d+$/.test(term)
                ? [{ terminalNumber: Number(term) }]
                : []),
              { agentCode: { contains: term, mode: 'insensitive' as const } },
              { fullName: { contains: term, mode: 'insensitive' as const } },
              { phoneNumber: { contains: term } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.agent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          agentId: true,
          agentCode: true,
          terminalNumber: true,
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

    return {
      agents: rows.map((a) => ({
        ...a,
        // Same six-digit form printed on the ticket, so what an admin sees
        // matches what they are reading off a slip.
        terminalNumber: a.terminalNumber
          ? String(a.terminalNumber).padStart(6, '0')
          : null,
      })),
      total,
      page,
      pageSize,
    };
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

    // Identity hashes never leave the server.
    const { bvnHash: _bvn, ninHash: _nin, idDocPath: _doc, ...safeAgent } = agent;

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

  // In-office onboarding: an admin captures identity documents in person.
  // Creates the agent in PENDING_KYC — activation is the separate approve step.
  async onboard(dto: OnboardAgentInput, adminId: string) {
    const existing = await this.prisma.agent.findFirst({
      where: { OR: [{ phoneNumber: dto.phoneNumber }, { email: dto.email }] },
    });
    if (existing) {
      throw new ConflictException('An agent with this phone or email already exists');
    }

    const [ninCheck, bvnCheck] = await Promise.all([
      this.identity.verifyNin(dto.nin, dto.fullName),
      this.identity.verifyBvn(dto.bvn, dto.fullName),
    ]);
    if (!ninCheck.verified) throw new ConflictException('NIN verification failed');
    if (!bvnCheck.verified) throw new ConflictException('BVN verification failed');

    const agentCode = await this.nextAgentCode(dto.registeredStateCode);

    const agent = await this.prisma.agent.create({
      data: {
        agentCode,
        fullName: dto.fullName,
        phoneNumber: dto.phoneNumber,
        email: dto.email ?? null,
        registeredStateCode: dto.registeredStateCode.toUpperCase(),
        status: AgentStatus.PENDING_KYC,
        // Raw NIN/BVN are never stored — only their hashes.
        bvnHash: createHash('sha256').update(dto.bvn).digest('hex'),
        ninHash: createHash('sha256').update(dto.nin).digest('hex'),
        idDocType: dto.idDocType,
        onboardedByAdminId: adminId,
        onboardingNote: dto.onboardingNote ?? null,
      },
      select: {
        agentId: true,
        agentCode: true,
        fullName: true,
        email: true,
        registeredStateCode: true,
        status: true,
        terminalNumber: true,
      },
    });

    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'AGENT_ONBOARDED',
      resource: { type: 'Agent', id: agent.agentId },
      metadata: {
        agentCode,
        stateCode: agent.registeredStateCode,
        ninLast4: dto.nin.slice(-4),
        bvnLast4: dto.bvn.slice(-4),
        idDocType: dto.idDocType,
        terminalNumber: agent.terminalNumber,
        // Flags agents onboarded before a real identity provider was wired.
        devModeVerification: ninCheck.devMode || bvnCheck.devMode,
      },
    });

    // Non-blocking: the agent record and its audit trail are already committed.
    // A mail outage must never fail an in-office registration with the person
    // sitting across the desk.
    const mail = agentOnboardingPending({
      fullName: agent.fullName,
      agentCode: agent.agentCode,
      terminalNumber: agent.terminalNumber ? String(agent.terminalNumber).padStart(6, '0') : null,
    });

    void this.email
      .send({ to: agent.email!, ...mail })
      .catch((e) =>
        this.logger.error(
          `Onboarding email failed for ${agentCode}: ${e instanceof Error ? e.message : 'unknown'}`,
        ),
      );

    return { agentId: agent.agentId, agentCode, status: agent.status, terminalNumber: agent.terminalNumber ? String(agent.terminalNumber).padStart(6, '0') : null};
  }

  // Sequential per-state code. Count-based, so it can race under concurrent
  // onboarding — acceptable while onboarding is one-admin-at-a-time in office.
  private async nextAgentCode(stateCode: string): Promise<string> {
    const count = await this.prisma.agent.count();
    return `RD-AGT-${stateCode.toUpperCase()}${String(count + 1).padStart(4, '0')}`;
  }
}