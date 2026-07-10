import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AuditActorType, AuditSeverity, DrawStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from './prisma.service';
import { EngineKeysService } from './engine-keys.service';

const POLL_MS = 30_000;

// Commit-then-reveal, stage 1: for every draw that could still execute and
// has no commitment, generate 32 random bytes, publish SHA-256(seed), and
// seal the seed itself. The hash existing BEFORE tickets close is what makes
// post-hoc seed selection provably impossible.
@Injectable()
export class SeedCommitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeedCommitService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: EngineKeysService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    void this.tick(); // immediate first pass on boot
    this.logger.log(`Seed-commit loop started (every ${POLL_MS / 1000}s)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return; // never overlap ticks
    this.running = true;
    try {
      const uncommitted = await this.prisma.draw.findMany({
        where: {
          status: {
            in: [
              DrawStatus.SCHEDULED,
              DrawStatus.ACTIVE,
              DrawStatus.SALES_CLOSED,
            ],
          },
          seedCommit: null,
        },
      });

      for (const draw of uncommitted) {
        await this.commitSeed(draw.drawId, draw.drawCode);
      }
    } catch (error) {
      this.logger.error(
        `Seed-commit tick failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private async commitSeed(drawId: string, drawCode: string): Promise<void> {
    const seed = randomBytes(32);
    const seedHash = createHash('sha256').update(seed).digest('hex');
    const sealedSeed = this.keys.seal(seed);

    try {
      await this.prisma.drawSeedCommit.create({
        data: { drawId, seedHash, sealedSeed },
      });
    } catch (error) {
      // P2002 = another pass already committed. Fine: first commit wins,
      // and a commitment must never be overwritten.
      if ((error as { code?: string }).code === 'P2002') return;
      throw error;
    }

    // Signed, append-only audit record of the commitment.
    const auditPayload = JSON.stringify({
      action: 'DRAW_SEED_COMMITTED',
      drawId,
      drawCode,
      seedHash,
    });

    await this.prisma.auditLog.create({
      data: {
        severity: AuditSeverity.INFO,
        actorType: AuditActorType.ENGINE,
        action: 'DRAW_SEED_COMMITTED',
        resourceType: 'Draw',
        resourceId: drawId,
        metadata: { drawCode, seedHash },
        signature: this.keys.signPayload(auditPayload),
      },
    });

    this.logger.log(`Seed committed for ${drawCode}: ${seedHash.slice(0, 16)}…`);
  }
}