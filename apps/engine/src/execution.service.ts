import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AuditActorType,
  AuditSeverity,
  DrawPrizeModel,
  DrawStatus,
  DrawType,
  JackpotEntryStatus,
  PoolRevenueBasis,
  Prisma,
  RetainedPrizeKind,
  TicketStatus,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { EngineKeysService } from './engine-keys.service';
import {
  computeMerkleRoot,
  deterministicWinnerIndex,
  pickWinnerIndexes,
  sha256Hex,
} from './draw-math.utils';
import {
  awardPlan,
  commissionNgn,
  formatBp,
  planPrizes,
  type Award,
  type PrizePlan,
} from './prize-pool.math';
import { WinnerQueueService } from './winner-queue.service';

const POLL_MS = 15_000;
// What every draw reads about each ticket in the pool.
const TICKET_POOL_SELECT = {
  ticketId: true,
  ticketRef: true,
  stateOfPlayCode: true,
  buyerPhone: true,
} as const;

type LockedTicket = {
  ticketId: string;
  ticketRef: string;
  stateOfPlayCode: string;
  buyerPhone: string;
  // Prize pool draws only.
  faceValueNgn?: number;
  agentId?: string | null;
};

const ENGINE_VERSION = '1.1.0';

type PoolUnit = {
  id: string; // ticketRef, or ENTRY-<entryId> for free jackpot entries
  kind: 'TICKET' | 'ENTRY';
  ticketId?: string;
  entryId?: string;
  buyerPhone: string;
};

type Winner = {
  winnerId: string;
  pickIndex: number;
  tierNo: number;
  tierName: string;
  unit: PoolUnit;
  prizeNgn: number;
  prizeDescription: string;
};

type PoolOutcome = {
  plan: PrizePlan;
  award: Award;
  revenueBasis: PoolRevenueBasis | null;
};

@Injectable()
export class ExecutionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutionService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: EngineKeysService,
    private readonly winnerQueue: WinnerQueueService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    void this.tick();
    this.logger.log(`Execution loop started (every ${POLL_MS / 1000}s)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.draw.findMany({
        where: {
          status: DrawStatus.SALES_CLOSED,
          scheduledAt: { lte: new Date() },
        },
        include: { seedCommit: true },
      });

      for (const draw of due) {
        await this.execute(draw.drawId);
      }
    } catch (error) {
      this.logger.error(
        `Execution tick failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async execute(drawId: string): Promise<void> {
    // Claim the draw. Guarded transition: exactly one process can win this.
    const claimed = await this.prisma.draw.updateMany({
      where: { drawId, status: DrawStatus.SALES_CLOSED },
      data: { status: DrawStatus.EXECUTING },
    });
    if (claimed.count === 0) return;

    const draw = await this.prisma.draw.findUniqueOrThrow({
      where: { drawId },
      include: { seedCommit: true, prizeTiers: true },
    });

    try {
      if (!draw.seedCommit) {
        throw new Error('No seed commitment — cannot execute');
      }

      // ── STAGE 2: LOCK THE ELIGIBLE POOL ──
      // Ticket prices and sellers are read only for prize pool draws, whose
      // pool depends on revenue. Every other draw never sees what a ticket
      // cost, so price cannot influence who wins.
      const readsRevenue = draw.prizeModel === DrawPrizeModel.POOL;
      const tickets: LockedTicket[] = await this.prisma.ticket.findMany({
        where: { drawId, status: TicketStatus.ACTIVE },
        orderBy: { ticketRef: 'asc' },
        select: readsRevenue
          ? { ...TICKET_POOL_SELECT, faceValueNgn: true, agentId: true }
          : TICKET_POOL_SELECT,
      });

      const pool: PoolUnit[] = tickets.map((t) => ({
        id: t.ticketRef,
        kind: 'TICKET' as const,
        ticketId: t.ticketId,
        buyerPhone: t.buyerPhone,
      }));

      if (draw.drawType === DrawType.SATURDAY_JACKPOT) {
        const entries = await this.prisma.jackpotEntry.findMany({
          where: { drawId, status: JackpotEntryStatus.ACTIVE },
          orderBy: { entryId: 'asc' },
          select: { entryId: true, buyerPhone: true },
        });
        pool.push(
          ...entries.map((e) => ({
            id: `ENTRY-${e.entryId}`,
            kind: 'ENTRY' as const,
            entryId: e.entryId,
            buyerPhone: e.buyerPhone,
          })),
        );
      }

      if (pool.length === 0) {
        await this.cancelEmptyDraw(drawId, draw.drawCode);
        return;
      }

      const merkleRoot = computeMerkleRoot(
        pool.map((u) => u.id),
        draw.drawCode,
      );

      await this.signedAudit('DRAW_TICKETS_LOCKED', drawId, {
        drawCode: draw.drawCode,
        poolSize: pool.length,
        ticketCount: tickets.length,
        merkleRoot,
      });

      // ── STAGE 3: UNSEAL + VERIFY THE SEED ──
      const seed = this.keys.unseal(draw.seedCommit.sealedSeed);
      const seedHash = sha256Hex(seed);
      if (seedHash !== draw.seedCommit.seedHash) {
        // The one error that must never be survived quietly.
        await this.signedAudit('DRAW_SEED_MISMATCH', drawId, {
          drawCode: draw.drawCode,
          committedHash: draw.seedCommit.seedHash,
          computedHash: seedHash,
        }, AuditSeverity.CRITICAL);
        throw new Error('SEED HASH MISMATCH — draw aborted, manual review required');
      }

      // ── STAGE 4: DETERMINISTIC SELECTION ──
      let winners: Winner[];
      let outcome: PoolOutcome | null = null;

      if (draw.prizeModel === DrawPrizeModel.SINGLE) {
        // Unchanged since the first release, so past results still verify.
        const winnerIndex = deterministicWinnerIndex(seed, draw.drawCode, pool.length);
        winners = [{
          winnerId: randomUUID(),
          pickIndex: 0,
          tierNo: 1,
          tierName: 'Prize',
          unit: pool[winnerIndex],
          prizeNgn: draw.prizeValueNgn,
          prizeDescription: draw.prizeDescription,
        }];
      } else {
        const eligibleRevenueNgn = readsRevenue
          ? await this.eligibleRevenue(draw.poolRevenueBasis, tickets)
          : 0;
        const plan = planPrizes(
          {
            model: draw.prizeModel === DrawPrizeModel.POOL ? 'POOL' : 'STAGES',
            payoutBp: draw.poolPayoutBp,
            minimumNgn: draw.poolMinimumNgn,
            tiers: draw.prizeTiers.map((t) => ({
              tierNo: t.tierNo,
              name: t.name,
              active: t.active,
              allocationBp: t.allocationBp,
              winnerCount: t.winnerCount,
              prizePerWinnerNgn: t.prizePerWinnerNgn,
              prizeDescription: t.prizeDescription,
            })),
          },
          eligibleRevenueNgn,
        );
        const award = awardPlan(plan, pool.length);
        const picked = pickWinnerIndexes(seed, draw.drawCode, pool.length, award.totalAwarded);

        // Picks fill tier 1 first, then 2, then 3.
        winners = [];
        let next = 0;
        for (const tier of award.tiers) {
          for (let i = 0; i < tier.awarded; i++) {
            winners.push({
              winnerId: randomUUID(),
              pickIndex: next,
              tierNo: tier.tierNo,
              tierName: tier.name,
              unit: pool[picked[next]],
              prizeNgn: tier.prizePerWinnerNgn,
              prizeDescription: tier.prizeDescription,
            });
            next++;
          }
        }

        outcome = {
          plan,
          award,
          revenueBasis: draw.prizeModel === DrawPrizeModel.POOL
            ? draw.poolRevenueBasis ?? PoolRevenueBasis.GROSS
            : null,
        };
      }

      // ── STAGE 5: SIGNED RESULT, atomically with status flips ──
      const stateBreakdown: Record<string, number> = {};
      for (const t of tickets) {
        stateBreakdown[t.stateOfPlayCode] = (stateBreakdown[t.stateOfPlayCode] ?? 0) + 1;
      }

      const executedAt = new Date();
      const headline = winners[0];
      const awardedNgn = winners.reduce((sum, w) => sum + w.prizeNgn, 0);
      const retained = outcome ? this.retainedRows(drawId, outcome) : [];
      const retainedNgn = retained.reduce((sum, r) => sum + r.amountNgn, 0);

      let certificate: Record<string, unknown> | null = null;
      let engineSignature: string;

      if (!outcome) {
        // The single-prize payload and signature are unchanged.
        const resultPayload = {
          drawId,
          drawCode: draw.drawCode,
          winnerTicketRef: headline.unit.id,
          prizeValueNgn: draw.prizeValueNgn,
          totalTicketsSold: tickets.length,
          totalEligibleParticipants: pool.length,
          rngSeedHash: seedHash,
          rngSeed: seed.toString('hex'),
          merkleRoot,
          engineVersion: ENGINE_VERSION,
          executedAt: executedAt.toISOString(),
        };
        engineSignature = this.keys.signPayload(JSON.stringify(resultPayload));
      } else {
        certificate = this.certificate({
          draw,
          outcome,
          winners,
          ticketsSold: tickets.length,
          eligibleEntries: pool.length,
          awardedNgn,
          retainedNgn,
          seedHash,
          seed,
          merkleRoot,
          executedAt,
        });
        engineSignature = this.keys.signPayload(JSON.stringify(certificate));
      }

      await this.prisma.$transaction(async (tx) => {
        const result = await tx.drawResult.create({
          data: {
            drawId,
            // Pools and stages: the first winner picked, or none if the pool
            // could not fund a single prize.
            winnerTicketRef: headline?.unit.id ?? 'NO-WINNER',
            prizeValueNgn: outcome ? awardedNgn : draw.prizeValueNgn,
            totalTicketsSold: tickets.length,
            totalEligibleParticipants: pool.length,
            rngSeedHash: seedHash,
            rngSeed: seed.toString('hex'),
            rngSeedHashedAt: draw.seedCommit!.committedAt,
            merkleRoot,
            stateBreakdown,
            zeroInterventionConfirmed: true,
            engineVersion: ENGINE_VERSION,
            engineSignature,
            executedAt,
            prizeModel: draw.prizeModel,
            eligibleRevenueNgn: outcome?.plan.eligibleRevenueNgn ?? null,
            prizePoolNgn: outcome?.plan.poolNgn ?? null,
            fundingShortfallNgn: outcome?.plan.fundingShortfallNgn ?? 0,
            retainedNgn,
            totalWinners: winners.length,
            certificate: certificate === null ? Prisma.JsonNull : (certificate as Prisma.InputJsonValue),
          },
        });

        if (winners.length > 0) {
          await tx.drawWinner.createMany({
            data: winners.map((w) => ({
              winnerId: w.winnerId,
              drawId,
              resultId: result.resultId,
              tierNo: w.tierNo,
              tierName: w.tierName,
              pickIndex: w.pickIndex,
              unitId: w.unit.id,
              ticketId: w.unit.ticketId ?? null,
              entryId: w.unit.entryId ?? null,
              buyerPhone: w.unit.buyerPhone,
              prizeNgn: w.prizeNgn,
              prizeDescription: w.prizeDescription,
            })),
          });
        }

        const ticketIds = winners.filter((w) => w.unit.kind === 'TICKET').map((w) => w.unit.ticketId!);
        const entryIds = winners.filter((w) => w.unit.kind === 'ENTRY').map((w) => w.unit.entryId!);

        if (ticketIds.length > 0) {
          await tx.ticket.updateMany({
            where: { ticketId: { in: ticketIds } },
            data: { status: TicketStatus.WINNING, isWinner: true },
          });
        }
        if (entryIds.length > 0) {
          await tx.jackpotEntry.updateMany({
            where: { entryId: { in: entryIds } },
            data: { status: JackpotEntryStatus.WINNING },
          });
        }

        if (retained.length > 0) {
          await tx.retainedPrize.createMany({ data: retained });
        }

        await tx.draw.update({
          where: { drawId },
          data: { status: DrawStatus.COMPLETED, executedAt },
        });
      });

      // Post-commit: hand each winner to the worker's SMS pipeline, which
      // also opens their claim. The engine itself never sends SMS.
      for (const w of winners) {
        await this.winnerQueue.enqueueWinnerSms({
          drawId,
          drawCode: draw.drawCode,
          drawWinnerId: w.winnerId,
          winnerPhone: w.unit.buyerPhone,
          winnerRef: w.unit.id,
          drawScheduledAt: draw.scheduledAt.toISOString(),
          prizeDescription: w.prizeDescription,
          prizeValueNgn: w.prizeNgn,
        });
      }

      await this.signedAudit('DRAW_COMPLETED', drawId, {
        drawCode: draw.drawCode,
        prizeModel: draw.prizeModel,
        winnerTicketRef: headline?.unit.id ?? null,
        totalWinners: winners.length,
        awardedNgn: outcome ? awardedNgn : draw.prizeValueNgn,
        prizePoolNgn: outcome?.plan.poolNgn ?? null,
        retainedNgn,
        poolSize: pool.length,
        engineSignature: engineSignature.slice(0, 24),
      });

      if (outcome && outcome.plan.fundingShortfallNgn > 0) {
        await this.signedAudit('DRAW_POOL_FUNDING_SHORTFALL', drawId, {
          drawCode: draw.drawCode,
          prizePoolNgn: outcome.plan.poolNgn,
          revenueShareNgn: outcome.plan.revenueShareNgn,
          fundingShortfallNgn: outcome.plan.fundingShortfallNgn,
        }, AuditSeverity.WARNING);
      }

      this.logger.log(
        `EXECUTED ${draw.drawCode}: ${winners.length} winner(s) of ${pool.length} (seed revealed)`,
      );
    } catch (error) {
      this.logger.error(
        `Execution of ${draw.drawCode} failed: ${
          error instanceof Error ? error.message : 'unknown'
        } — draw left in EXECUTING for manual review`,
      );
    }
  }

  // Eligible revenue for a prize pool: every active ticket at face value,
  // less the selling agent's commission when the draw is set to net.
  private async eligibleRevenue(
    basis: PoolRevenueBasis | null,
    tickets: LockedTicket[],
  ): Promise<number> {
    if (tickets.some((t) => t.faceValueNgn === undefined)) {
      throw new Error('Ticket prices were not read for this prize pool draw');
    }
    const gross = tickets.reduce((sum, t) => sum + (t.faceValueNgn as number), 0);

    if (basis !== PoolRevenueBasis.NET_OF_COMMISSION) {
      return gross;
    }

    const agentIds = [...new Set(tickets.map((t) => t.agentId).filter((id): id is string => Boolean(id)))];
    if (agentIds.length === 0) return gross;

    const agents = await this.prisma.agent.findMany({
      where: { agentId: { in: agentIds } },
      select: { agentId: true, commissionRate: true, overrideCommissionRate: true },
    });
    const rateBp = new Map(
      agents.map((a) => [
        a.agentId,
        Math.round(Number((a.overrideCommissionRate ?? a.commissionRate).toString()) * 10000),
      ]),
    );

    let commission = 0;
    for (const t of tickets) {
      if (t.agentId) commission += commissionNgn(t.faceValueNgn as number, rateBp.get(t.agentId) ?? 0);
    }

    return Math.max(0, gross - commission);
  }

  // The uncollected prizes ledger entries a pool or stage draw creates.
  private retainedRows(drawId: string, outcome: PoolOutcome) {
    const rows: Array<{ drawId: string; kind: RetainedPrizeKind; amountNgn: number; tierNo: number | null; note: string }> = [];

    if (outcome.plan.poolNgn !== null) {
      const allocated = outcome.plan.tiers.reduce((sum, t) => sum + (t.allocationNgn ?? 0), 0);
      const poolRounding = outcome.plan.poolNgn - allocated;
      if (poolRounding > 0) {
        rows.push({ drawId, kind: RetainedPrizeKind.ROUNDING, amountNgn: poolRounding, tierNo: null, note: 'Pool percentage rounding' });
      }
    }

    for (const tier of outcome.award.tiers) {
      if (tier.roundingNgn > 0) {
        rows.push({
          drawId,
          kind: RetainedPrizeKind.ROUNDING,
          amountNgn: tier.roundingNgn,
          tierNo: tier.tierNo,
          note: `${tier.name}: allocation left after whole winners`,
        });
      }
      if (tier.unawardedNgn > 0) {
        rows.push({
          drawId,
          kind: RetainedPrizeKind.UNAWARDED,
          amountNgn: tier.unawardedNgn,
          tierNo: tier.tierNo,
          note: `${tier.name}: ${tier.unawarded} prize(s) not awarded, not enough entries`,
        });
      }
    }

    return rows;
  }

  // The draw integrity certificate. Everything needed to check the draw.
  private certificate(input: {
    draw: { drawCode: string; drawType: DrawType; prizeModel: DrawPrizeModel; poolPayoutBp: number | null; poolMinimumNgn: number | null; scheduledAt: Date };
    outcome: PoolOutcome;
    winners: Winner[];
    ticketsSold: number;
    eligibleEntries: number;
    awardedNgn: number;
    retainedNgn: number;
    seedHash: string;
    seed: Buffer;
    merkleRoot: string;
    executedAt: Date;
  }): Record<string, unknown> {
    const { draw, outcome, winners } = input;
    return {
      certificateVersion: 1,
      drawCode: draw.drawCode,
      drawType: draw.drawType,
      prizeModel: draw.prizeModel,
      scheduledAt: draw.scheduledAt.toISOString(),
      executedAt: input.executedAt.toISOString(),
      ticketsSold: input.ticketsSold,
      eligibleEntries: input.eligibleEntries,
      pool: draw.prizeModel === DrawPrizeModel.POOL
        ? {
            revenueBasis: outcome.revenueBasis,
            eligibleRevenueNgn: outcome.plan.eligibleRevenueNgn,
            payoutRatio: formatBp(draw.poolPayoutBp ?? 0),
            minimumPoolNgn: draw.poolMinimumNgn,
            revenueShareNgn: outcome.plan.revenueShareNgn,
            prizePoolNgn: outcome.plan.poolNgn,
            fundingShortfallNgn: outcome.plan.fundingShortfallNgn,
          }
        : null,
      tiers: outcome.award.tiers.map((t) => ({
        tierNo: t.tierNo,
        name: t.name,
        prizePerWinnerNgn: t.prizePerWinnerNgn,
        allocationNgn: t.allocationNgn,
        winnersAllowed: t.winners,
        winnersAwarded: t.awarded,
        awardedNgn: t.awarded * t.prizePerWinnerNgn,
        roundingNgn: t.roundingNgn,
        unawardedNgn: t.unawardedNgn,
      })),
      totals: {
        winners: winners.length,
        awardedNgn: input.awardedNgn,
        retainedNgn: input.retainedNgn,
      },
      winners: winners.map((w) => ({
        pickIndex: w.pickIndex,
        tierNo: w.tierNo,
        entry: w.unit.id,
        prizeNgn: w.prizeNgn,
      })),
      randomness: {
        seedHash: input.seedHash,
        seed: input.seed.toString('hex'),
        ticketListMerkleRoot: input.merkleRoot,
        method:
          'Pool: active tickets by ticketRef ascending, then free entries by entryId ascending. ' +
          'Pick k (from 0) takes index HMAC-SHA256-counter(sha256(seed || "<drawCode>:PICK:<k>")) ' +
          'with rejection sampling, uniform over the entries not yet picked. Tier 1 is filled first.',
      },
      engineVersion: ENGINE_VERSION,
    };
  }

  private async cancelEmptyDraw(drawId: string, drawCode: string): Promise<void> {
    await this.prisma.draw.update({
      where: { drawId },
      data: { status: DrawStatus.CANCELLED },
    });
    await this.signedAudit('DRAW_NO_PARTICIPANTS', drawId, { drawCode }, AuditSeverity.WARNING);
    this.logger.warn(`${drawCode}: no participants — cancelled`);
  }

  private async signedAudit(
    action: string,
    drawId: string,
    metadata: Record<string, unknown>,
    severity: AuditSeverity = AuditSeverity.INFO,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        severity,
        actorType: AuditActorType.ENGINE,
        action,
        resourceType: 'Draw',
        resourceId: drawId,
        metadata: metadata as never,
        signature: this.keys.signPayload(JSON.stringify({ action, drawId, ...metadata })),
      },
    });
  }
}