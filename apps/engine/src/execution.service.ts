import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  DrawType,
  JackpotEntryStatus,
  TicketStatus,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { EngineKeysService } from './engine-keys.service';
import {
  computeMerkleRoot,
  deterministicWinnerIndex,
  sha256Hex,
} from './draw-math.utils';
import { WinnerQueueService } from './winner-queue.service';

const POLL_MS = 15_000;
const ENGINE_VERSION = '1.0.0';

type PoolUnit = {
  id: string; // ticketRef, or ENTRY-<entryId> for free jackpot entries
  kind: 'TICKET' | 'ENTRY';
  ticketId?: string;
  entryId?: string;
  buyerPhone: string;
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
      include: { seedCommit: true },
    });

    try {
      if (!draw.seedCommit) {
        throw new Error('No seed commitment — cannot execute');
      }

      // ── STAGE 2: LOCK THE ELIGIBLE POOL ──
      const tickets = await this.prisma.ticket.findMany({
        where: { drawId, status: TicketStatus.ACTIVE },
        orderBy: { ticketRef: 'asc' },
        select: { ticketId: true, ticketRef: true, stateOfPlayCode: true, buyerPhone: true },
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
      const winnerIndex = deterministicWinnerIndex(seed, draw.drawCode, pool.length);
      const winner = pool[winnerIndex];

      // ── STAGE 5: SIGNED RESULT, atomically with status flips ──
      const stateBreakdown: Record<string, number> = {};
      for (const t of tickets) {
        stateBreakdown[t.stateOfPlayCode] = (stateBreakdown[t.stateOfPlayCode] ?? 0) + 1;
      }

      const executedAt = new Date();
      const resultPayload = {
        drawId,
        drawCode: draw.drawCode,
        winnerTicketRef: winner.id,
        prizeValueNgn: draw.prizeValueNgn,
        totalTicketsSold: tickets.length,
        totalEligibleParticipants: pool.length,
        rngSeedHash: seedHash,
        rngSeed: seed.toString('hex'),
        merkleRoot,
        engineVersion: ENGINE_VERSION,
        executedAt: executedAt.toISOString(),
      };
      const engineSignature = this.keys.signPayload(JSON.stringify(resultPayload));

      await this.prisma.$transaction(async (tx) => {
        await tx.drawResult.create({
          data: {
            drawId,
            winnerTicketRef: winner.id,
            prizeValueNgn: draw.prizeValueNgn,
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
          },
        });

        if (winner.kind === 'TICKET') {
          await tx.ticket.update({
            where: { ticketId: winner.ticketId! },
            data: { status: TicketStatus.WINNING, isWinner: true },
          });
        } else {
          await tx.jackpotEntry.update({
            where: { entryId: winner.entryId! },
            data: { status: JackpotEntryStatus.WINNING },
          });
        }

        await tx.draw.update({
          where: { drawId },
          data: { status: DrawStatus.COMPLETED, executedAt },
        });
      });

      // Post-commit: hand the winner to the worker's SMS pipeline. The
      // engine itself never talks to Termii.
      await this.winnerQueue.enqueueWinnerSms({
        drawId,
        drawCode: draw.drawCode,
        winnerPhone: winner.buyerPhone,
        winnerRef: winner.id,
        drawScheduledAt: draw.scheduledAt.toISOString(),
        prizeDescription: draw.prizeDescription,
        prizeValueNgn: draw.prizeValueNgn,
      });

      await this.signedAudit('DRAW_COMPLETED', drawId, {
        drawCode: draw.drawCode,
        winnerTicketRef: winner.id,
        poolSize: pool.length,
        engineSignature: engineSignature.slice(0, 24),
      });

      this.logger.log(
        `EXECUTED ${draw.drawCode}: winner ${winner.id} of ${pool.length} (seed revealed)`,
      );
    } catch (error) {
      this.logger.error(
        `Execution of ${draw.drawCode} failed: ${
          error instanceof Error ? error.message : 'unknown'
        } — draw left in EXECUTING for manual review`,
      );
    }
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