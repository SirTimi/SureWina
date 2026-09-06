import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditActorType, AuditSeverity } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CustomerAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // 360° view by phone — works for guests and registered users alike.
  async detail(phoneNumber: string) {
    console.log('[detail] received:', JSON.stringify(phoneNumber));
    const [user, payments, tickets, claims, accumulation, block] =
      await Promise.all([
        this.prisma.user.findUnique({ where: { phoneNumber } }),
        this.prisma.paymentTransaction.aggregate({
          where: { buyerPhone: phoneNumber, status: 'CONFIRMED' },
          _sum: { amountNgn: true, ticketCount: true },
          _count: true,
        }),
        this.prisma.ticket.count({ where: { buyerPhone: phoneNumber } }),
        this.prisma.prizeClaim.findMany({
          where: { winnerPhone: phoneNumber },
          select: {
            claimId: true,
            winnerTicketRef: true,
            status: true,
            grossPrizeValueNgn: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.jackpotAccumulation.findUnique({
          where: { buyerPhone: phoneNumber },
        }),
        this.prisma.blockedPhone.findUnique({ where: { phoneNumber } }),
      ]);

    if (!user && payments._count === 0 && tickets === 0) {
      throw new NotFoundException('No activity for this phone number');
    }

    return {
      phoneNumber,
      registered: !!user,
      displayName: user?.displayName ?? null,
      kycStatus: user?.kycStatus ?? null,
      blocked: !!block,
      blockReason: block?.reason ?? null,
      lifetime: {
        spendNgn: payments._sum.amountNgn ?? 0,
        ticketsBought: payments._sum.ticketCount ?? 0,
        transactions: payments._count,
        ticketRows: tickets,
      },
            // Support staff need both: the weekly figure answers "am I close to a
      // free entry?", the lifetime one answers "how much have I earned from
      // this?". The weekly counters reset every Saturday, so showing only
      // those would make a long-standing customer look brand new.
      accumulation: accumulation
        ? {
            thisWeek: {
              ticketCount: accumulation.cumulativeCount,
              entriesEarned: accumulation.jackpotEntriesTotal,
              ticketsToNextEntry:
                accumulation.cumulativeCount % 10 === 0 &&
                accumulation.cumulativeCount > 0
                  ? 10
                  : 10 - (accumulation.cumulativeCount % 10),
            },
            lifetime: {
              ticketCount: accumulation.lifetimeTicketCount,
              entriesEarned: accumulation.lifetimeEntriesTotal,
            },
            lastTicketAt: accumulation.lastTicketAt.toISOString(),
          }
        : null,
      claims: claims.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  async block(phoneNumber: string, reason: string, adminId: string) {
    try {
      await this.prisma.blockedPhone.create({
        data: { phoneNumber, reason, blockedBy: adminId },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Phone is already blocked');
      }
      throw error;
    }
    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'CUSTOMER_BLOCKED',
      resource: { type: 'BlockedPhone', id: phoneNumber },
      metadata: { reason },
    });
    return { phoneNumber, blocked: true, reason };
  }

  async unblock(phoneNumber: string, adminId: string) {
    const existing = await this.prisma.blockedPhone.findUnique({
      where: { phoneNumber },
    });
    if (!existing) throw new NotFoundException('Phone is not blocked');

    await this.prisma.blockedPhone.delete({ where: { phoneNumber } });
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'CUSTOMER_UNBLOCKED',
      resource: { type: 'BlockedPhone', id: phoneNumber },
      metadata: { previousReason: existing.reason },
    });
    return { phoneNumber, blocked: false };
  }

  // The enforcement primitive the purchase doors call.
  async assertNotBlocked(phoneNumber: string): Promise<void> {
    const block = await this.prisma.blockedPhone.findUnique({
      where: { phoneNumber },
    });
    if (block) {
      throw new ConflictException('Purchases are not available for this account');
    }
  }
}