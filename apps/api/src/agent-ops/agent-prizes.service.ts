import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgentStatus,
  AuditActorType,
  AuditSeverity,
  ClaimType,
  PrizeClaimStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WhtDeductionService } from '../claims/wht-deduction.service';
import { SettingsService } from '../config/settings.service';

// Claims an agent may settle in cash: not yet in KYC, not terminal.
const AGENT_PAYABLE: PrizeClaimStatus[] = [
  PrizeClaimStatus.NOTIFIED,
  PrizeClaimStatus.SELECTION_MADE,
];

@Injectable()
export class AgentPrizesService {
  private readonly logger = new Logger(AgentPrizesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly whtDeductions: WhtDeductionService,
    private readonly settings: SettingsService,

  ) {}

  async lookup(ticketRefRaw: string) {
    const { ticket, claim, maxNgn } = await this.resolve(ticketRefRaw);

    const payable =
      !!claim &&
      AGENT_PAYABLE.includes(claim.status) &&
      claim.grossPrizeValueNgn <= maxNgn;

    return {
      ticketRef: ticket.ticketRef,
      isWinner: ticket.isWinner,
      prizeDescription: claim?.drawResult.draw.prizeDescription ?? null,
      grossPrizeValueNgn: claim?.grossPrizeValueNgn ?? null,
      claimStatus: claim?.status ?? null,
      agentPayableMaxNgn: maxNgn,
      agentPayable: payable,
      reason: !ticket.isWinner
        ? 'Not a winning ticket'
        : !claim
          ? 'No claim record yet — try again shortly'
          : !AGENT_PAYABLE.includes(claim.status)
            ? `Claim is ${claim.status} — must be settled through the app`
            : claim.grossPrizeValueNgn > maxNgn
              ? 'Prize exceeds the agent-payable limit'
              : null,
    };
  }

  async logPayment(agentId: string, ticketRefRaw: string) {
    const agent = await this.prisma.agent.findUnique({ where: { agentId } });
    if (!agent || agent.status !== AgentStatus.ACTIVE) {
      throw new ConflictException('Agent account is not active');
    }

    const { claim, maxNgn } = await this.resolve(ticketRefRaw);
    if (!claim) throw new NotFoundException('No claim found for this ticket');
    if (claim.grossPrizeValueNgn > maxNgn) {
      throw new ConflictException('Prize exceeds the agent-payable limit');
    }

    const reference = `AGT-CASH-${agent.agentCode}-${Date.now()}`;

    // Guarded one-shot: only flips from an agent-payable status. A second
    // attempt (same or different agent) matches zero rows and 409s.
    const result = await this.prisma.prizeClaim.updateMany({
      where: { claimId: claim.claimId, status: { in: AGENT_PAYABLE } },
      data: {
        status: PrizeClaimStatus.CASH_PAID,
        claimType: ClaimType.CASH,
        claimTypeSelectedAt: claim.claimTypeSelectedAt ?? new Date(),
        payoutReference: reference,
        payoutInitiatedAt: new Date(),
        fulfilledAt: new Date(),
        paidByAgentId: agentId,
        paidByAgentAt: new Date(),
      },
      
    });
    if (result.count === 0) {
      throw new ConflictException('This prize can no longer be paid by an agent');
    }
    await this.whtDeductions.recordForClaim(claim.claimId);

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.AGENT, id: agentId },
      action: 'AGENT_PRIZE_PAID',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: {
        agentCode: agent.agentCode,
        ticketRef: claim.winnerTicketRef,
        amountNgn: claim.grossPrizeValueNgn,
        reference,
      },
    });

    this.logger.log(
      `Agent prize payout: ${agent.agentCode} paid NGN ${claim.grossPrizeValueNgn.toLocaleString('en-NG')} for ${claim.winnerTicketRef}`,
    );

    return {
      paid: true,
      reference,
      ticketRef: claim.winnerTicketRef,
      amountNgn: claim.grossPrizeValueNgn, // small prizes: gross, no WHT path
    };
  }

  private async resolve(ticketRefRaw: string) {
    const ticketRef = ticketRefRaw.toUpperCase();
    const ticket = await this.prisma.ticket.findUnique({
      where: { ticketRef },
      select: { ticketRef: true, isWinner: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const claim = ticket.isWinner
      ? await this.prisma.prizeClaim.findFirst({
          where: { winnerTicketRef: ticket.ticketRef },
          include: {
            drawResult: {
              select: { draw: { select: { prizeDescription: true } } },
            },
          },
        })
      : null;

    const maxNgn = await this.settings.getNumber('AGENT_PAYOUT_MAX_NGN', 50000);
    return { ticket, claim, maxNgn };
  }
}