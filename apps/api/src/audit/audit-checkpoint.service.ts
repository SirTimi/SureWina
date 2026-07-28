import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

const SWEEP_MS = 60 * 60_000; // hourly

@Injectable()
export class AuditCheckpointService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditCheckpointService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.seal(), SWEEP_MS);
    this.logger.log('Audit checkpoint loop started (hourly)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // Canonical form of one entry. Field order is fixed and must never change,
  // or every historical root becomes unverifiable.
  private entryDigest(e: {
    seq: number;
    timestamp: Date;
    severity: string;
    actorType: string;
    actorId: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata: unknown;
  }): string {
    return createHash('sha256')
      .update(
        [
          e.seq,
          e.timestamp.toISOString(),
          e.severity,
          e.actorType,
          e.actorId ?? '',
          e.action,
          e.resourceType,
          e.resourceId,
          JSON.stringify(e.metadata ?? null),
        ].join('|'),
      )
      .digest('hex');
  }

  private rootOf(entryDigests: string[], previousRootHash: string | null): string {
    return createHash('sha256')
      .update([previousRootHash ?? 'GENESIS', ...entryDigests].join(''))
      .digest('hex');
  }

  // Seals every entry written since the last checkpoint. Windows are closed
  // once sealed: anything arriving later belongs to the next one, so a late
  // write can never invalidate an existing root.
  async seal(): Promise<{ sealed: boolean; entryCount?: number; rootHash?: string }> {
    if (this.running) return { sealed: false };
    this.running = true;

    try {
      const last = await this.prisma.auditCheckpoint.findFirst({
        orderBy: { toSeq: 'desc' },
      });
      const fromSeq = (last?.toSeq ?? 0) + 1;

      const entries = await this.prisma.auditLog.findMany({
        where: { seq: { gte: fromSeq } },
        orderBy: { seq: 'asc' },
      });

      if (entries.length === 0) return { sealed: false };

      const digests = entries.map((e) =>
        this.entryDigest({
          seq: e.seq,
          timestamp: e.timestamp,
          severity: e.severity,
          actorType: e.actorType,
          actorId: e.actorId,
          action: e.action,
          resourceType: e.resourceType,
          resourceId: e.resourceId,
          metadata: e.metadata,
        }),
      );

      const rootHash = this.rootOf(digests, last?.rootHash ?? null);
      const first = entries[0];
      const lastEntry = entries[entries.length - 1];

      const checkpoint = await this.prisma.auditCheckpoint.create({
        data: {
          windowStart: first.timestamp,
          windowEnd: lastEntry.timestamp,
          fromSeq: first.seq,
          toSeq: lastEntry.seq,
          entryCount: entries.length,
          rootHash,
          previousRootHash: last?.rootHash ?? null,
        },
      });

      this.logger.log(
        `Sealed checkpoint ${checkpoint.checkpointId}: seq ${first.seq}–${lastEntry.seq} (${entries.length} entries)`,
      );

      return { sealed: true, entryCount: entries.length, rootHash };
    } catch (error) {
      this.logger.error(
        `Checkpoint seal failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { sealed: false };
    } finally {
      this.running = false;
    }
  }

  // Recomputes every checkpoint from the log as it stands now. A mismatch
  // means entries in that window were altered or removed after sealing.
  async verify() {
    const checkpoints = await this.prisma.auditCheckpoint.findMany({
      orderBy: { toSeq: 'asc' },
    });

    const results: {
      checkpointId: string;
      fromSeq: number;
      toSeq: number;
      windowEnd: string;
      expectedEntries: number;
      foundEntries: number;
      intact: boolean;
    }[] = [];

    let previousRootHash: string | null = null;

    for (const cp of checkpoints) {
      const entries = await this.prisma.auditLog.findMany({
        where: { seq: { gte: cp.fromSeq, lte: cp.toSeq } },
        orderBy: { seq: 'asc' },
      });

      const digests = entries.map((e) =>
        this.entryDigest({
          seq: e.seq,
          timestamp: e.timestamp,
          severity: e.severity,
          actorType: e.actorType,
          actorId: e.actorId,
          action: e.action,
          resourceType: e.resourceType,
          resourceId: e.resourceId,
          metadata: e.metadata,
        }),
      );

      // Chain against the stored previous root, so one broken window doesn't
      // cascade into reporting every later window as broken too.
      const recomputed = this.rootOf(digests, cp.previousRootHash);

      results.push({
        checkpointId: cp.checkpointId,
        fromSeq: cp.fromSeq,
        toSeq: cp.toSeq,
        windowEnd: cp.windowEnd.toISOString(),
        expectedEntries: cp.entryCount,
        foundEntries: entries.length,
        intact: recomputed === cp.rootHash,
      });

      previousRootHash = cp.rootHash;
    }

    const broken = results.filter((r) => !r.intact);

    return {
      checkpoints: results.length,
      intact: broken.length === 0,
      brokenWindows: broken.length,
      latestRootHash: previousRootHash,
      results,
    };
  }
}