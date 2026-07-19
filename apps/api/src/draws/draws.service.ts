import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  Draw,
  DrawStatus,
  DrawType,
  Prisma,
  TicketStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDrawDto } from './dto/create-draw.dto';
import { UpdateDrawDto } from './dto/update-draw.dto';
import {
  GetDrawResponseDto,
  ListActiveDrawsResponseDto,
  toDrawPublic,
} from './draws.types';

// Statuses a customer is allowed to see / buy into on the public surface.
const PUBLIC_VISIBLE_STATUSES: DrawStatus[] = [
  DrawStatus.ACTIVE,
  DrawStatus.SALES_CLOSED,
];

@Injectable()
export class DrawsService {
  private readonly logger = new Logger(DrawsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── PUBLIC READ ──────────────────────────────────────────

  async listActive(): Promise<ListActiveDrawsResponseDto> {
    const draws = await this.prisma.draw.findMany({
      where: {
        status: DrawStatus.ACTIVE,
        cutoffAt: { gt: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    return { draws: draws.map(toDrawPublic) };
  }

  async getByCode(drawCode: string): Promise<GetDrawResponseDto> {
    const draw = await this.prisma.draw.findUnique({
      where: { drawCode },
      include: { seedCommit: { select: {seedHash:true}}}
    });

    if (!draw || !PUBLIC_VISIBLE_STATUSES.includes(draw.status)) {
      throw new NotFoundException('Draw not found');
    }

    const ticketsSold = await this.prisma.ticket.count({
      where: { drawId: draw.drawId, status: TicketStatus.ACTIVE },
    });

    // Prize pool = tickets sold * price. For jackpot draws this is the
    // accumulated stake; for product draws it's informational.
    const prizePoolNgn = ticketsSold * draw.ticketPriceNgn;

    return {
      draw: toDrawPublic(draw),
      ticketsSold,
      prizePoolNgn,
      jackpotEligible: draw.drawType === DrawType.SATURDAY_JACKPOT,
      seedCommittedHash: draw.seedCommit?.seedHash ?? null
    };
  }

  // ─── ADMIN CRUD ───────────────────────────────────────────

  async create(dto: CreateDrawDto, adminId: string): Promise<Draw> {
    const scheduledAt = new Date(dto.scheduledAt);
    const cutoffAt = new Date(dto.cutoffAt);

    this.assertScheduleValid(scheduledAt, cutoffAt);

    const drawCode = this.generateDrawCode(dto.drawType, scheduledAt);

    let draw: Draw;
    try {
      draw = await this.prisma.draw.create({
        data: {
          drawCode,
          drawType: dto.drawType,
          status: DrawStatus.SCHEDULED,
          prizeDescription: dto.prizeDescription,
          prizeValueNgn: dto.prizeValueNgn,
          prizeImageUrl: dto.prizeImageUrl ?? null,
          ticketPriceNgn: dto.ticketPriceNgn,
          ticketQuota: dto.ticketQuota ?? null,
          scheduledAt,
          cutoffAt,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `A draw already exists for code ${drawCode}`,
        );
      }
      throw error;
    }

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'DRAW_CREATED',
      resource: { type: 'Draw', id: draw.drawId },
      metadata: {
        drawCode: draw.drawCode,
        drawType: draw.drawType,
        prizeValueNgn: draw.prizeValueNgn,
      },
    });

    this.logger.log(`Draw created: ${draw.drawCode} by admin ${adminId}`);
    return draw;
  }

  async update(
    drawId: string,
    dto: UpdateDrawDto,
    adminId: string,
  ): Promise<Draw> {
    const existing = await this.prisma.draw.findUnique({ where: { drawId } });
    if (!existing) {
      throw new NotFoundException('Draw not found');
    }

    // Only SCHEDULED draws are freely editable. Once ACTIVE (sales open),
    // tickets may exist and prize/price changes would be unfair.
    if (existing.status !== DrawStatus.SCHEDULED) {
      throw new ConflictException(
        `Only SCHEDULED draws can be edited (current: ${existing.status})`,
      );
    }

    const scheduledAt = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : existing.scheduledAt;
    const cutoffAt = dto.cutoffAt ? new Date(dto.cutoffAt) : existing.cutoffAt;
    this.assertScheduleValid(scheduledAt, cutoffAt);

    const draw = await this.prisma.draw.update({
      where: { drawId },
      data: {
        prizeDescription: dto.prizeDescription ?? undefined,
        prizeValueNgn: dto.prizeValueNgn ?? undefined,
        prizeImageUrl:
          dto.prizeImageUrl === undefined ? undefined : dto.prizeImageUrl,
        ticketPriceNgn: dto.ticketPriceNgn ?? undefined,
        ticketQuota: dto.ticketQuota ?? undefined,
        scheduledAt: dto.scheduledAt ? scheduledAt : undefined,
        cutoffAt: dto.cutoffAt ? cutoffAt : undefined,
        configVersion: { increment: 1 },
      },
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'DRAW_UPDATED',
      resource: { type: 'Draw', id: draw.drawId },
      metadata: { drawCode: draw.drawCode, changes: { ...dto } },
    });

    return draw;
  }

  async cancel(drawId: string, adminId: string): Promise<Draw> {
    const existing = await this.prisma.draw.findUnique({ where: { drawId } });
    if (!existing) {
      throw new NotFoundException('Draw not found');
    }

    const cancellable: DrawStatus[] = [
      DrawStatus.SCHEDULED,
      DrawStatus.ACTIVE,
      DrawStatus.SALES_CLOSED,
    ];
    if (!cancellable.includes(existing.status)) {
      throw new ConflictException(
        `Draw cannot be cancelled from status ${existing.status}`,
      );
    }

    const draw = await this.prisma.draw.update({
      where: { drawId },
      data: { status: DrawStatus.CANCELLED },
    });

    // NOTE: ticket refunds are handled in Phase 6.3+ (payments) / admin refund
    // ops. Here we only transition status and record the intent.
    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'DRAW_CANCELLED',
      resource: { type: 'Draw', id: draw.drawId },
      metadata: {
        drawCode: draw.drawCode,
        previousStatus: existing.status,
      },
    });

    this.logger.warn(`Draw cancelled: ${draw.drawCode} by admin ${adminId}`);
    return draw;
  }

  async listForAdmin(status?: DrawStatus) {
    const draws = await this.prisma.draw.findMany({
      where: status ? { status } : undefined,
      orderBy: { scheduledAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { tickets: true } },
      },
    });

    return {
      draws: draws.map((d) => ({
        drawId: d.drawId,
        drawCode: d.drawCode,
        drawType: d.drawType,
        prizeDescription: d.prizeDescription,
        prizeValueNgn: d.prizeValueNgn,
        ticketPriceNgn: d.ticketPriceNgn,
        ticketQuota: d.ticketQuota,
        ticketsSold: d._count.tickets,
        scheduledAt: d.scheduledAt.toISOString(),
        cutoffAt: d.cutoffAt.toISOString(),
        status: d.status,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }

  async detailForAdmin(drawId: string) {
    const draw = await this.prisma.draw.findUnique({
      where: { drawId },
      include: {
        _count: { select: { tickets: true } },
        seedCommit: true,
        result: true,
      },
    });
    if (!draw) throw new NotFoundException('Draw not found');

    const [salesAgg, agentAgg] = await Promise.all([
      this.prisma.ticket.aggregate({
        where: { drawId },
        _sum: { faceValueNgn: true },
      }),
      this.prisma.ticket.count({
        where: { drawId, ticketType: 'AGENT' as never },
      }).catch(() => 0),
    ]);

    return {
      draw: {
        drawId: draw.drawId,
        drawCode: draw.drawCode,
        drawType: draw.drawType,
        prizeDescription: draw.prizeDescription,
        prizeValueNgn: draw.prizeValueNgn,
        prizeImageUrl: draw.prizeImageUrl,
        ticketPriceNgn: draw.ticketPriceNgn,
        ticketQuota: draw.ticketQuota,
        scheduledAt: draw.scheduledAt.toISOString(),
        cutoffAt: draw.cutoffAt.toISOString(),
        status: draw.status,
        createdAt: draw.createdAt.toISOString(),
      },
      sales: {
        ticketsSold: draw._count.tickets,
        grossSalesNgn: salesAgg._sum.faceValueNgn ?? 0,
        agentTickets: agentAgg,
      },
      seed: draw.seedCommit
        ? {
            seedHash: draw.seedCommit.seedHash,
            committedAt: draw.seedCommit.committedAt?.toISOString() ?? null,
            revealed: !!draw.result,
          }
        : null,
      result: draw.result
        ? {
            winnerTicketRef: draw.result.winnerTicketRef,
            executedAt: draw.result.executedAt.toISOString(),
            rngSeed: draw.result.rngSeed,
            rngSeedHash: draw.result.rngSeedHash,
            merkleRoot: draw.result.merkleRoot,
            engineVersion: draw.result.engineVersion,
            engineSignature: draw.result.engineSignature,
            totalTicketsSold: draw.result.totalTicketsSold,
            totalEligibleParticipants: draw.result.totalEligibleParticipants,
            zeroInterventionConfirmed: draw.result.zeroInterventionConfirmed,
            stateBreakdown: draw.result.stateBreakdown,
          }
        : null,
    };
  }

  // Read-only readiness view. Deliberately has no execute action: draws are
  // run by the engine alone, so no human can cause a draw to happen.
  async preChecks(drawId: string) {
    const draw = await this.prisma.draw.findUnique({
      where: { drawId },
      include: {
        _count: { select: { tickets: true } },
        seedCommit: true,
        result: true,
      },
    });
    if (!draw) throw new NotFoundException('Draw not found');

    const now = Date.now();
    const cutoffPassed = draw.cutoffAt.getTime() <= now;
    const duePassed = draw.scheduledAt.getTime() <= now;
    const ticketsSold = draw._count.tickets;

    const checks = [
      {
        key: 'SEED_COMMITTED',
        label: 'RNG seed committed',
        detail: draw.seedCommit
          ? `Committed ${draw.seedCommit.committedAt?.toISOString() ?? ''}`
          : 'Engine has not committed a seed yet',
        ok: !!draw.seedCommit,
        blocking: true,
      },
      {
        key: 'HAS_TICKETS',
        label: 'Tickets sold',
        detail: `${ticketsSold} ticket${ticketsSold === 1 ? '' : 's'} in the pool`,
        ok: ticketsSold > 0,
        blocking: true,
      },
      {
        key: 'PRIZE_SET',
        label: 'Prize configured',
        detail: `${draw.prizeDescription} · ₦${draw.prizeValueNgn.toLocaleString('en-NG')}`,
        ok: draw.prizeValueNgn > 0 && draw.prizeDescription.length >= 3,
        blocking: true,
      },
      {
        key: 'CUTOFF',
        label: 'Sales cutoff reached',
        detail: cutoffPassed
          ? 'Sales are closed'
          : `Sales close ${draw.cutoffAt.toISOString()}`,
        ok: cutoffPassed,
        blocking: false,
      },
      {
        key: 'DUE',
        label: 'Draw time reached',
        detail: duePassed
          ? 'Due — engine will execute on its next pass'
          : `Runs ${draw.scheduledAt.toISOString()}`,
        ok: duePassed,
        blocking: false,
      },
      {
        key: 'NOT_EXECUTED',
        label: 'Not yet executed',
        detail: draw.result
          ? `Executed ${draw.result.executedAt.toISOString()}`
          : 'Awaiting execution',
        ok: !draw.result,
        blocking: false,
      },
    ];

    const blockers = checks.filter((c) => c.blocking && !c.ok);

    return {
      drawId: draw.drawId,
      drawCode: draw.drawCode,
      status: draw.status,
      scheduledAt: draw.scheduledAt.toISOString(),
      cutoffAt: draw.cutoffAt.toISOString(),
      executed: !!draw.result,
      readyToRun: blockers.length === 0 && !draw.result,
      blockingIssues: blockers.map((b) => b.label),
      checks,
    };
  }

  // ─── HELPERS ──────────────────────────────────────────────

  private assertScheduleValid(scheduledAt: Date, cutoffAt: Date): void {
    if (Number.isNaN(scheduledAt.getTime()) || Number.isNaN(cutoffAt.getTime())) {
      throw new BadRequestException('Invalid date value');
    }
    if (cutoffAt >= scheduledAt) {
      throw new BadRequestException('cutoffAt must be before scheduledAt');
    }
  }

  // RD-DRAW-YYYYMMDD-TYPE  (date in WAT / UTC+1)
  private generateDrawCode(drawType: DrawType, scheduledAt: Date): string {
    const wat = new Date(scheduledAt.getTime() + 60 * 60 * 1000);
    const y = wat.getUTCFullYear();
    const m = String(wat.getUTCMonth() + 1).padStart(2, '0');
    const d = String(wat.getUTCDate()).padStart(2, '0');
    const suffix =
      drawType === DrawType.SATURDAY_JACKPOT
        ? 'JACKPOT'
        : drawType === DrawType.PRODUCT_PRIZE
          ? 'PRODUCT'
          : 'DAILY';
    return `RD-DRAW-${y}${m}${d}-${suffix}`;
  }
}