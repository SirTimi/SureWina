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
  DrawPrizeModel,
  DrawStatus,
  DrawType,
  PoolRevenueBasis,
  Prisma,
  TicketStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDrawDto } from './dto/create-draw.dto';
import { UpdateDrawDto } from './dto/update-draw.dto';
import { PrizeTierDto } from './dto/prize-tier.dto';
import {
  TierInput,
  formatBp,
  planPrizes,
  validatePrizeConfig,
} from './prize-pool.math';
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

// The prize settings a draw is saved with once they have been checked.
type ResolvedPrize = {
  prizeModel: DrawPrizeModel;
  prizeValueNgn: number;
  poolPayoutBp: number | null;
  poolMinimumNgn: number | null;
  poolRevenueBasis: PoolRevenueBasis | null;
  tiers: TierInput[];
};

type PrizeFields = {
  prizeModel?: DrawPrizeModel;
  prizeValueNgn?: number;
  poolPayoutBp?: number | null;
  poolMinimumNgn?: number | null;
  poolRevenueBasis?: PoolRevenueBasis | null;
  tiers?: PrizeTierDto[] | TierInput[];
};

const PRIZE_FIELD_KEYS = [
  'prizeModel',
  'prizeValueNgn',
  'poolPayoutBp',
  'poolMinimumNgn',
  'poolRevenueBasis',
  'tiers',
] as const;

export type PrizePreviewRequest = {
  prizeModel: DrawPrizeModel;
  poolPayoutBp?: number | null;
  poolMinimumNgn?: number | null;
  tiers: TierInput[];
  revenuesNgn?: number[];
  drawId?: string;
};

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
      include: { product: true },
      // Soonest first; within a slot, cheapest product first.
      orderBy: [{ scheduledAt: 'asc' }, { ticketPriceNgn: 'asc' }],
    });

    return { draws: draws.map(toDrawPublic) };
  }

  async getByCode(drawCode: string): Promise<GetDrawResponseDto> {
    const draw = await this.prisma.draw.findUnique({
      where: { drawCode },
      include: {
        seedCommit: { select: { seedHash: true } },
        product: true,
        prizeTiers: { where: { active: true }, orderBy: { tierNo: 'asc' } },
      },
    });

    if (!draw || !PUBLIC_VISIBLE_STATUSES.includes(draw.status)) {
      throw new NotFoundException('Draw not found');
    }

    const [ticketsSold, stake] = await Promise.all([
      this.prisma.ticket.count({
        where: {
          drawId: draw.drawId,
          status: TicketStatus.ACTIVE,
        },
      }),
      this.prisma.ticket.aggregate({
        where: {
          drawId: draw.drawId,
          status: TicketStatus.ACTIVE,
        },
        _sum: {
          faceValueNgn: true,
        },
      }),
    ]);

    // The draw keeps its standard/list price, but realized stake comes from
    // what each active ticket actually paid. This keeps mixed NGN 5,000
    // normal jackpot tickets and NGN 500 promotional tickets accurate.
    const prizePoolNgn =
      stake._sum.faceValueNgn ?? 0;

    return {
      draw: toDrawPublic(draw),
      ticketsSold,
      prizePoolNgn,
      jackpotEligible: draw.drawType === DrawType.SATURDAY_JACKPOT,
      seedCommittedHash: draw.seedCommit?.seedHash ?? null,
      // What the draw pays, for buyers. Pools: each category's share and
      // prize, and the guaranteed minimum. Stages: winners and prize each.
      prizes:
        draw.prizeModel !== DrawPrizeModel.POOL && draw.prizeModel !== DrawPrizeModel.STAGES
          ? null
          : {
              model: draw.prizeModel,
              guaranteedPoolNgn: draw.prizeModel === DrawPrizeModel.POOL ? draw.poolMinimumNgn : null,
              payoutRatio: draw.prizeModel === DrawPrizeModel.POOL && draw.poolPayoutBp ? formatBp(draw.poolPayoutBp) : null,
              categories: (draw.prizeTiers ?? []).map((t) => ({
                name: t.name,
                prizePerWinnerNgn: t.prizePerWinnerNgn,
                prizeDescription: t.prizeDescription,
                itemPrize: t.itemPrize,
                shareOfPool: t.allocationBp != null ? formatBp(t.allocationBp) : null,
                winners: t.winnerCount,
              })),
            },
    };
  }

  // ─── ADMIN CRUD ───────────────────────────────────────────

  async create(dto: CreateDrawDto, adminId: string): Promise<Draw> {
    const scheduledAt = new Date(dto.scheduledAt);
    const cutoffAt = new Date(dto.cutoffAt);

    this.assertScheduleValid(scheduledAt, cutoffAt);

    const drawCode = this.generateDrawCode(dto.drawType, scheduledAt);
    const prize = this.resolvePrize(dto);

    let draw: Draw;
    try {
      draw = await this.prisma.draw.create({
        data: {
          drawCode,
          drawType: dto.drawType,
          status: DrawStatus.SCHEDULED,
          prizeDescription: dto.prizeDescription,
          prizeValueNgn: prize.prizeValueNgn,
          prizeModel: prize.prizeModel,
          poolPayoutBp: prize.poolPayoutBp,
          poolMinimumNgn: prize.poolMinimumNgn,
          poolRevenueBasis: prize.poolRevenueBasis,
          prizeTiers: { create: prize.tiers.map(tierRow) },
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
        ...prizeAuditFields(prize),
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

    // Prize settings are re-checked as a whole: what was sent, filled in
    // from what the draw already has.
    const prizeTouched = PRIZE_FIELD_KEYS.some((k) => dto[k] !== undefined);
    let prize: ResolvedPrize | null = null;
    let before: ResolvedPrize | null = null;

    if (prizeTouched) {
      const existingTiers = await this.prisma.drawPrizeTier.findMany({
        where: { drawId },
        orderBy: { tierNo: 'asc' },
      });
      before = {
        prizeModel: existing.prizeModel,
        prizeValueNgn: existing.prizeValueNgn,
        poolPayoutBp: existing.poolPayoutBp,
        poolMinimumNgn: existing.poolMinimumNgn,
        poolRevenueBasis: existing.poolRevenueBasis,
        tiers: existingTiers.map(tierInput),
      };
      const model = dto.prizeModel ?? existing.prizeModel;
      const sameModel = model === existing.prizeModel;
      prize = this.resolvePrize({
        prizeModel: model,
        prizeValueNgn: dto.prizeValueNgn ?? (sameModel ? existing.prizeValueNgn : undefined),
        poolPayoutBp: dto.poolPayoutBp ?? (sameModel ? existing.poolPayoutBp : undefined),
        poolMinimumNgn: dto.poolMinimumNgn ?? (sameModel ? existing.poolMinimumNgn : undefined),
        poolRevenueBasis: dto.poolRevenueBasis ?? (sameModel ? existing.poolRevenueBasis : undefined),
        tiers: dto.tiers ?? (sameModel ? before.tiers : undefined),
      });
    }

    const draw = await this.prisma.$transaction(async (tx) => {
      // Guarded on status so a draw that opened for sales a moment ago is
      // never changed.
      const changed = await tx.draw.updateMany({
        where: { drawId, status: DrawStatus.SCHEDULED, prizeConfigLockedAt: null },
        data: {
          prizeDescription: dto.prizeDescription ?? undefined,
          prizeValueNgn: prize ? prize.prizeValueNgn : undefined,
          prizeModel: prize?.prizeModel,
          poolPayoutBp: prize ? prize.poolPayoutBp : undefined,
          poolMinimumNgn: prize ? prize.poolMinimumNgn : undefined,
          poolRevenueBasis: prize ? prize.poolRevenueBasis : undefined,
          prizeImageUrl:
            dto.prizeImageUrl === undefined ? undefined : dto.prizeImageUrl,
          ticketPriceNgn: dto.ticketPriceNgn ?? undefined,
          ticketQuota: dto.ticketQuota ?? undefined,
          scheduledAt: dto.scheduledAt ? scheduledAt : undefined,
          cutoffAt: dto.cutoffAt ? cutoffAt : undefined,
          configVersion: { increment: 1 },
        },
      });

      if (changed.count !== 1) {
        throw new ConflictException(
          'This draw has opened for sales, so it can no longer be edited',
        );
      }

      if (prize) {
        await tx.drawPrizeTier.deleteMany({ where: { drawId } });
        if (prize.tiers.length > 0) {
          await tx.drawPrizeTier.createMany({
            data: prize.tiers.map((t) => ({ drawId, ...tierRow(t) })),
          });
        }
      }

      return tx.draw.findUniqueOrThrow({ where: { drawId } });
    });

    const { tiers: _tiers, ...plainChanges } = dto;
    const poolTermsChanged =
      !!prize &&
      !!before &&
      (prize.poolPayoutBp !== before.poolPayoutBp ||
        prize.poolMinimumNgn !== before.poolMinimumNgn);

    await this.audit.write({
      // Payout ratio and minimum pool are the money terms Mr Alex wants
      // approvals for; until that workflow exists, they are flagged.
      severity: poolTermsChanged ? AuditSeverity.WARNING : AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'DRAW_UPDATED',
      resource: { type: 'Draw', id: draw.drawId },
      metadata: {
        drawCode: draw.drawCode,
        changes: { ...plainChanges },
        ...(prize && before
          ? { prizeBefore: prizeAuditFields(before), prizeAfter: prizeAuditFields(prize) }
          : {}),
        poolTermsChanged,
      },
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
        prizeTiers: { orderBy: { tierNo: 'asc' } },
        winners: {
          orderBy: { pickIndex: 'asc' },
          include: { claim: { select: { claimId: true, status: true } } },
        },
        retainedPrizes: { orderBy: { recordedAt: 'asc' } },
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
        prizeModel: draw.prizeModel,
        poolPayoutBp: draw.poolPayoutBp,
        poolMinimumNgn: draw.poolMinimumNgn,
        poolRevenueBasis: draw.poolRevenueBasis,
        prizeConfigLockedAt: draw.prizeConfigLockedAt?.toISOString() ?? null,
        tiers: draw.prizeTiers.map((t) => ({
          tierNo: t.tierNo,
          name: t.name,
          active: t.active,
          allocationBp: t.allocationBp,
          winnerCount: t.winnerCount,
          prizePerWinnerNgn: t.prizePerWinnerNgn,
          prizeDescription: t.prizeDescription,
          itemPrize: t.itemPrize,
        })),
      },
      winners: draw.winners.map((w) => ({
        winnerId: w.winnerId,
        pickIndex: w.pickIndex,
        tierNo: w.tierNo,
        tierName: w.tierName,
        unitId: w.unitId,
        buyerPhone: maskPhone(w.buyerPhone),
        prizeNgn: w.prizeNgn,
        prizeDescription: w.prizeDescription,
        claimId: w.claim?.claimId ?? null,
        claimStatus: w.claim?.status ?? null,
      })),
      retained: draw.retainedPrizes.map((r) => ({
        kind: r.kind,
        tierNo: r.tierNo,
        amountNgn: r.amountNgn,
        note: r.note,
        recordedAt: r.recordedAt.toISOString(),
      })),
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
            prizeModel: draw.result.prizeModel,
            eligibleRevenueNgn: draw.result.eligibleRevenueNgn,
            prizePoolNgn: draw.result.prizePoolNgn,
            fundingShortfallNgn: draw.result.fundingShortfallNgn,
            retainedNgn: draw.result.retainedNgn,
            totalWinners: draw.result.totalWinners,
            awardedNgn: draw.result.prizeValueNgn,
            certificate: draw.result.certificate,
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
        prizeTiers: true,
      },
    });
    if (!draw) throw new NotFoundException('Draw not found');

    const now = Date.now();
    const prizeCheck = this.prizeCheck(draw, draw.prizeTiers.map(tierInput));
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
        detail: prizeCheck.detail,
        ok: prizeCheck.ok,
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

  // The commit-reveal registry: every seed commitment with its reveal state.
  // This page is the operator's view of the same chain the public verifier walks.
  async seedRegistry(status?: DrawStatus) {
    const draws = await this.prisma.draw.findMany({
      where: {
        seedCommit: { isNot: null },
        ...(status ? { status } : {}),
      },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
      include: {
        seedCommit: true,
        result: {
          select: {
            rngSeed: true,
            rngSeedHash: true,
            executedAt: true,
            engineSignature: true,
          },
        },
      },
    });

    return {
      seeds: draws.map((d) => ({
        drawId: d.drawId,
        drawCode: d.drawCode,
        drawType: d.drawType,
        status: d.status,
        scheduledAt: d.scheduledAt.toISOString(),
        committedHash: d.seedCommit!.seedHash,
        committedAt: d.seedCommit!.committedAt?.toISOString() ?? null,
        revealed: !!d.result,
        revealedSeed: d.result?.rngSeed ?? null,
        revealMatches: d.result ? d.result.rngSeedHash === d.seedCommit!.seedHash : null,
        executedAt: d.result?.executedAt?.toISOString() ?? null,
        engineSignature: d.result?.engineSignature ?? null,
      })),
    };
  }

  // What a prize setup would pay at a few revenue levels, using the exact
  // arithmetic the engine runs the draw with. Nothing is saved.
  async prizePreview(req: PrizePreviewRequest) {
    const model = req.prizeModel;
    if (model !== DrawPrizeModel.POOL && model !== DrawPrizeModel.STAGES) {
      throw new BadRequestException('Preview is for prize pool and jackpot stage draws');
    }

    const config = {
      model,
      payoutBp: req.poolPayoutBp ?? null,
      minimumNgn: req.poolMinimumNgn ?? null,
      tiers: (req.tiers ?? []).map(tierInput),
    };
    const errors = validatePrizeConfig(config);
    if (errors.length > 0) {
      return { valid: false, errors, scenarios: [], current: null, breakEvenRevenueNgn: null };
    }

    const revenues = (req.revenuesNgn ?? [])
      .filter((r) => Number.isSafeInteger(r) && r >= 0)
      .slice(0, 8);
    const levels = revenues.length > 0 ? revenues : [0, 500_000, 1_000_000, 2_000_000, 5_000_000];

    let current: { eligibleRevenueNgn: number; ticketsSold: number; plan: ReturnType<typeof planPrizes> } | null = null;
    if (req.drawId) {
      const agg = await this.prisma.ticket.aggregate({
        where: { drawId: req.drawId, status: TicketStatus.ACTIVE },
        _sum: { faceValueNgn: true },
        _count: { _all: true },
      });
      const gross = agg._sum.faceValueNgn ?? 0;
      current = { eligibleRevenueNgn: gross, ticketsSold: agg._count._all, plan: planPrizes(config, gross) };
    }

    // The revenue at which the payout share first covers the minimum.
    const breakEvenRevenueNgn =
      model === DrawPrizeModel.POOL && config.payoutBp
        ? Math.ceil(((config.minimumNgn ?? 0) * 10000) / config.payoutBp)
        : null;

    return {
      valid: true,
      errors: [],
      payoutRatio: config.payoutBp ? formatBp(config.payoutBp) : null,
      breakEvenRevenueNgn,
      scenarios: levels.map((r) => planPrizes(config, r)),
      current,
    };
  }

  // ─── HELPERS ──────────────────────────────────────────────

  // Checks a draw's prize settings and works out the headline prize value.
  // Throws a 400 listing every problem.
  private resolvePrize(fields: PrizeFields): ResolvedPrize {
    const model = fields.prizeModel ?? DrawPrizeModel.SINGLE;

    if (model === DrawPrizeModel.SINGLE) {
      if (!Number.isSafeInteger(fields.prizeValueNgn) || (fields.prizeValueNgn as number) < 1) {
        throw new BadRequestException('A single-prize draw needs a prize value of at least ₦1');
      }
      if (fields.tiers && fields.tiers.length > 0) {
        throw new BadRequestException('A single-prize draw has no tiers');
      }
      return {
        prizeModel: model,
        prizeValueNgn: fields.prizeValueNgn as number,
        poolPayoutBp: null,
        poolMinimumNgn: null,
        poolRevenueBasis: null,
        tiers: [],
      };
    }

    const tiers = (fields.tiers ?? []).map(tierInput);
    const config = {
      model,
      payoutBp: fields.poolPayoutBp ?? null,
      minimumNgn: fields.poolMinimumNgn ?? null,
      tiers,
    };
    const errors = validatePrizeConfig(config);
    if (errors.length > 0) {
      throw new BadRequestException({ message: errors, error: 'Invalid prize setup' });
    }

    if (model === DrawPrizeModel.POOL) {
      return {
        prizeModel: model,
        // The headline is what is guaranteed: the minimum pool.
        prizeValueNgn: config.minimumNgn as number,
        poolPayoutBp: config.payoutBp,
        poolMinimumNgn: config.minimumNgn,
        poolRevenueBasis: fields.poolRevenueBasis ?? PoolRevenueBasis.GROSS,
        tiers,
      };
    }

    const plan = planPrizes(config, 0);
    return {
      prizeModel: model,
      prizeValueNgn: plan.totalPrizeNgn,
      poolPayoutBp: null,
      poolMinimumNgn: null,
      poolRevenueBasis: null,
      tiers,
    };
  }

  private prizeCheck(
    draw: Pick<Draw, 'prizeModel' | 'prizeDescription' | 'prizeValueNgn' | 'poolPayoutBp' | 'poolMinimumNgn'>,
    tiers: TierInput[],
  ): { ok: boolean; detail: string } {
    if (draw.prizeModel === DrawPrizeModel.SINGLE) {
      return {
        ok: draw.prizeValueNgn > 0 && draw.prizeDescription.length >= 3,
        detail: `${draw.prizeDescription} · ₦${draw.prizeValueNgn.toLocaleString('en-NG')}`,
      };
    }

    const errors = validatePrizeConfig({
      model: draw.prizeModel,
      payoutBp: draw.poolPayoutBp,
      minimumNgn: draw.poolMinimumNgn,
      tiers,
    });
    if (errors.length > 0) {
      return { ok: false, detail: errors.join('; ') };
    }

    const active = tiers.filter((t) => t.active).sort((a, b) => a.tierNo - b.tierNo);
    if (draw.prizeModel === DrawPrizeModel.POOL) {
      return {
        ok: true,
        detail: `Prize pool: ${formatBp(draw.poolPayoutBp as number)} of revenue, at least ₦${(draw.poolMinimumNgn as number).toLocaleString('en-NG')} · ${active
          .map((t) => `${t.name} ${formatBp(t.allocationBp as number)} at ₦${t.prizePerWinnerNgn.toLocaleString('en-NG')}`)
          .join(', ')}`,
      };
    }
    return {
      ok: true,
      detail: `Jackpot stages: ${active
        .map((t) => `${t.name} ${t.winnerCount} × ₦${t.prizePerWinnerNgn.toLocaleString('en-NG')}`)
        .join(', ')}`,
    };
  }

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

function tierInput(t: {
  tierNo: number;
  name: string;
  active: boolean;
  allocationBp?: number | null;
  winnerCount?: number | null;
  prizePerWinnerNgn: number;
  prizeDescription?: string | null;
  itemPrize?: boolean | null;
}): TierInput {
  return {
    tierNo: t.tierNo,
    name: t.name,
    active: t.active,
    allocationBp: t.allocationBp ?? null,
    winnerCount: t.winnerCount ?? null,
    prizePerWinnerNgn: t.prizePerWinnerNgn,
    prizeDescription: t.prizeDescription ?? null,
    itemPrize: !!t.itemPrize,
  };
}

function tierRow(t: TierInput) {
  return {
    tierNo: t.tierNo,
    name: t.name.trim(),
    active: t.active,
    allocationBp: t.allocationBp ?? null,
    winnerCount: t.winnerCount ?? null,
    prizePerWinnerNgn: t.prizePerWinnerNgn,
    prizeDescription: t.prizeDescription?.trim() || null,
    itemPrize: !!t.itemPrize,
  };
}

function prizeAuditFields(p: ResolvedPrize) {
  return {
    prizeModel: p.prizeModel,
    poolPayoutBp: p.poolPayoutBp,
    poolMinimumNgn: p.poolMinimumNgn,
    poolRevenueBasis: p.poolRevenueBasis,
    tiers: p.tiers,
  };
}

function maskPhone(phone: string): string {
  return phone.length > 7 ? `${phone.slice(0, 6)}****${phone.slice(-3)}` : '****';
}
