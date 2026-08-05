import {
    ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdminRole,
  AuditActorType,
  AuditSeverity,
  RemittanceStatus,
} from '@prisma/client';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { ListRemittancesQueryDto } from './dto/list-remittances.dto'
@Controller('admin/finance/remittances')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.FINANCE_OFFICER)
export class AdminFinanceAgentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query() q: ListRemittancesQueryDto) {
    const rows = await this.prisma.remittance.findMany({
      where: q.status
        ? { status: q.status }
        : {
            status: {
              in: [
                RemittanceStatus.AGENT_CONFIRMED,
                RemittanceStatus.PENDING,
                RemittanceStatus.LATE,
              ],
            },
          },
      include: {
        agent: {
          select: { agentCode: true, fullName: true, phoneNumber: true },
        },
      },
      orderBy: [{ status: 'asc' }, { periodDate: 'desc' }],
      take: 200,
    });

    return {
      remittances: rows.map((r) => ({
        remittanceId: r.remittanceId,
        agentCode: r.agent.agentCode,
        agentName: r.agent.fullName,
        agentPhone: r.agent.phoneNumber,
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
        agentConfirmedAt: r.agentConfirmedAt?.toISOString() ?? null,
        receivedAt: r.receivedAt?.toISOString() ?? null,
      })),
    };
  }

  @Post(':remittanceId/mark-received')
  async markReceived(
    @Param('remittanceId') id: string,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    const rem = await this.prisma.remittance.findUnique({
      where: { remittanceId: id },
    });
    if (!rem) throw new NotFoundException('Remittance not found');
    if (rem.status === RemittanceStatus.RECEIVED) {
      throw new ConflictException('Remittance is already marked received');
    }

    const updated = await this.prisma.remittance.update({
      where: { remittanceId: id },
      data: { status: RemittanceStatus.RECEIVED, receivedAt: new Date() },
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: admin.sub },
      action: 'REMITTANCE_RECEIVED',
      resource: { type: 'Remittance', id },
      metadata: { amountDueNgn: rem.amountDueNgn },
    });

    return updated;
  }

  // An agent's daily records over a date range — the reconciliation view.
  // Figures are read straight from the snapshot, never recomputed, so a
  // later void or rate change cannot rewrite history.
  @Get('agent/:agentId/statement')
  async statement(
    @Param('agentId') agentId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const agent = await this.prisma.agent.findUnique({
      where: { agentId },
      select: { agentCode: true, fullName: true, phoneNumber: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const rows = await this.prisma.remittance.findMany({
      where: {
        agentId,
        ...(from || to
          ? {
              periodDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { periodDate: 'desc' },
      take: 400,
    });

    const days = rows.map((r) => ({
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
      status: r.status,
      bankTransferRef: r.bankTransferRef,
      receivedAt: r.receivedAt?.toISOString() ?? null,
    }));

    return {
      agent,
      fromDate: from ?? null,
      toDate: to ?? null,
      generatedAt: new Date().toISOString(),
      days,
      totals: {
        days: days.length,
        tickets: days.reduce((s, d) => s + d.ticketCount, 0),
        standardTickets: days.reduce((s, d) => s + d.standardTicketCount, 0),
        jackpotTickets: days.reduce((s, d) => s + d.jackpotTicketCount, 0),
        grossSalesNgn: days.reduce((s, d) => s + d.grossSalesNgn, 0),
        commissionNgn: days.reduce((s, d) => s + d.commissionNgn, 0),
        winningsPaidOutNgn: days.reduce((s, d) => s + d.winningsPaidOutNgn, 0),
        amountDueNgn: days.reduce((s, d) => s + d.amountDueNgn, 0),
      },
    };
  }
}