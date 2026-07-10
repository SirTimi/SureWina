import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AuditActorType, AuditSeverity, DrawStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { EngineKeysService } from './engine-keys.service';

const POLL_MS = 15_000;

// Moves draws through their sales lifecycle on the clock. Activation is
// gated on the seed commitment existing: no draw sells tickets before its
// seed hash is on public record.
@Injectable()
export class LifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LifecycleService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: EngineKeysService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    void this.tick();
    this.logger.log(`Lifecycle loop started (every ${POLL_MS / 1000}s)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.activateCommittedDraws();
      await this.closeSalesAtCutoff();
    } catch (error) {
      this.logger.error(
        `Lifecycle tick failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async activateCommittedDraws(): Promise<void> {
    const ready = await this.prisma.draw.findMany({
      where: {
        status: DrawStatus.SCHEDULED,
        cutoffAt: { gt: new Date() },
        seedCommit: { isNot: null },
      },
    });

    for (const draw of ready) {
      await this.transition(draw.drawId, draw.drawCode, DrawStatus.SCHEDULED, DrawStatus.ACTIVE);
    }
  }

  private async closeSalesAtCutoff(): Promise<void> {
    const due = await this.prisma.draw.findMany({
      where: {
        status: { in: [DrawStatus.ACTIVE, DrawStatus.SCHEDULED] },
        cutoffAt: { lte: new Date() },
      },
    });

    for (const draw of due) {
      await this.transition(draw.drawId, draw.drawCode, draw.status, DrawStatus.SALES_CLOSED);
    }
  }

  // Guarded transition: updateMany with the expected FROM status means a
  // concurrent change (admin cancel, another tick) makes this a no-op
  // instead of a stomp.
  private async transition(
    drawId: string,
    drawCode: string,
    from: DrawStatus,
    to: DrawStatus,
  ): Promise<void> {
    const result = await this.prisma.draw.updateMany({
      where: { drawId, status: from },
      data: { status: to },
    });
    if (result.count === 0) return;

    const auditPayload = JSON.stringify({
      action: 'DRAW_STATUS_TRANSITION',
      drawId,
      drawCode,
      from,
      to,
    });

    await this.prisma.auditLog.create({
      data: {
        severity: AuditSeverity.INFO,
        actorType: AuditActorType.ENGINE,
        action: 'DRAW_STATUS_TRANSITION',
        resourceType: 'Draw',
        resourceId: drawId,
        metadata: { drawCode, from, to },
        signature: this.keys.signPayload(auditPayload),
      },
    });

    this.logger.log(`${drawCode}: ${from} → ${to}`);
  }
}