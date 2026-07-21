import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminRole, PaymentStatus, Prisma } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { PrismaService } from '../database/prisma.service';

class SearchTicketsDto {
  @IsString() @MinLength(4) q!: string;
}

class ListPaymentsDto {
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() toDate?: string;
}

@Controller('admin/tickets')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR)
export class TicketAdminController {
  constructor(private readonly prisma: PrismaService) {}

  // Search by exact ticket ref or by buyer phone (E.164 or trailing digits).
  @Get('search')
  async search(@Query() q: SearchTicketsDto) {
    const term = q.q.trim().toUpperCase();
    const isRef = term.startsWith('SW-');

    const tickets = await this.prisma.ticket.findMany({
      where: isRef
        ? { ticketRef: term }
        : { buyerPhone: { endsWith: term.replace(/[^\d+]/g, '') } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        draw: { select: { drawCode: true, prizeDescription: true, status: true } },
        payment: {
          select: { txnId: true, gateway: true, status: true, gatewayReference: true },
        },
        agent: { select: { agentCode: true, fullName: true } },
      },
    });

    return {
      tickets: tickets.map((t) => ({
        ticketRef: t.ticketRef,
        drawCode: t.draw.drawCode,
        drawStatus: t.draw.status,
        prizeDescription: t.draw.prizeDescription,
        buyerPhone: t.buyerPhone,
        faceValueNgn: t.faceValueNgn,
        channel: t.purchaseChannel,
        stateOfPlayCode: t.stateOfPlayCode,
        status: t.status,
        isWinner: t.isWinner,
        agentCode: t.agent?.agentCode ?? null,
        payment: {
          txnId: t.payment.txnId,
          gateway: t.payment.gateway,
          status: t.payment.status,
          gatewayReference: t.payment.gatewayReference,
        },
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  // Payment browser — the discovery path for refunds and failed payments.
  @Get('payments')
  async payments(@Query() q: ListPaymentsDto) {
    const where: Prisma.PaymentTransactionWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.fromDate || q.toDate
        ? {
            createdAt: {
              ...(q.fromDate ? { gte: new Date(q.fromDate) } : {}),
              ...(q.toDate ? { lte: new Date(`${q.toDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.paymentTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      payments: rows.map((p) => ({
        txnId: p.txnId,
        gatewayReference: p.gatewayReference,
        gateway: p.gateway,
        status: p.status,
        buyerPhone: p.buyerPhone,
        amountNgn: p.amountNgn,
        ticketCount: p.ticketCount,
        failureReason: p.failureReason,
        confirmedAt: p.confirmedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }
}