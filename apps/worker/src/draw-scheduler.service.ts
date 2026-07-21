import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  DrawType,
  DrawTemplate,
} from '@prisma/client';
import { PrismaService } from './prisma.service';

const SWEEP_MS = 5 * 60_000;
const WAT_OFFSET_MS = 60 * 60 * 1000;
const HORIZON_DAYS = 7; // create draws for the coming week

// Keeps the storefront stocked from versioned DrawTemplate config: for each
// day in the horizon, any ACTIVE template whose weekdays include that WAT day
// gets a draw. Idempotent on drawCode, so downtime self-heals and concurrent
// ticks can't double-create. Config changes take effect on the next tick —
// no redeploy needed.
@Injectable()
export class DrawSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DrawSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), SWEEP_MS);
    void this.tick();
    this.logger.log('Draw scheduler started (every 5m, template-driven)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const now = new Date();
      const templates = await this.activeTemplates(now);

      if (templates.length === 0) {
        this.logger.warn('No ACTIVE draw templates — nothing to schedule');
        return;
      }

      for (let offset = 0; offset < HORIZON_DAYS; offset++) {
        const watDate = this.watDate(new Date(now.getTime() + offset * 86_400_000));
        const weekday = new Date(Date.UTC(watDate.y, watDate.m, watDate.d)).getUTCDay();

        for (const t of templates) {
          if (!t.weekdays.includes(weekday)) continue;
          await this.ensureFromTemplate(t, watDate, now);
        }
      }
    } catch (error) {
      this.logger.error(
        `Draw scheduler failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }

  // Resolve the config in force right now: ACTIVE, effective window covers now.
  private async activeTemplates(now: Date): Promise<DrawTemplate[]> {
    return this.prisma.drawTemplate.findMany({
      where: {
        status: 'ACTIVE',
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: [{ templateType: 'asc' }, { version: 'desc' }],
    });
  }

  private async ensureFromTemplate(
    t: DrawTemplate,
    watDate: { y: number; m: number; d: number },
    now: Date,
  ) {
    const scheduledAt = this.watMinutesToUtc(watDate, t.scheduledMinutesWat);
    const cutoffAt = this.watMinutesToUtc(watDate, t.cutoffMinutesWat);

    if (cutoffAt.getTime() <= now.getTime()) return; // window already past

    const suffix = t.templateType === 'SATURDAY_JACKPOT' ? 'JACKPOT' : 'DAILY';

    await this.createIfMissing({
      drawCode: `RD-DRAW-${this.ymd(watDate)}-${suffix}`,
      drawType:
        t.templateType === 'SATURDAY_JACKPOT'
          ? DrawType.SATURDAY_JACKPOT
          : DrawType.DAILY_STANDARD,
      prizeDescription: t.prizeDescription,
      prizeValueNgn: t.prizeValueNgn,
      ticketPriceNgn: t.ticketPriceNgn,
      ticketQuota: t.ticketQuota,
      scheduledAt,
      cutoffAt,
      templateId: t.templateId,
      templateVersion: t.version,
    });
  }

  private async createIfMissing(data: {
    drawCode: string;
    drawType: DrawType;
    prizeDescription: string;
    prizeValueNgn: number;
    ticketPriceNgn: number;
    ticketQuota: number | null;
    scheduledAt: Date;
    cutoffAt: Date;
    templateId: string;
    templateVersion: number;
  }) {
    const { templateId, templateVersion, ...drawData } = data;

    try {
      const draw = await this.prisma.draw.create({
        data: { ...drawData, status: DrawStatus.SCHEDULED },
      });

      await this.prisma.auditLog.create({
        data: {
          severity: AuditSeverity.INFO,
          actorType: AuditActorType.SYSTEM,
          action: 'DRAW_AUTO_SCHEDULED',
          resourceType: 'Draw',
          resourceId: draw.drawId,
          metadata: {
            drawCode: data.drawCode,
            drawType: data.drawType,
            templateId,
            templateVersion,
          },
        },
      });

      this.logger.log(
        `Auto-scheduled ${data.drawCode} from template ${templateId} v${templateVersion}`,
      );
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error; // exists → fine
    }
  }

  // ── WAT date helpers ──

  private watDate(instant: Date) {
    const w = new Date(instant.getTime() + WAT_OFFSET_MS);
    return { y: w.getUTCFullYear(), m: w.getUTCMonth(), d: w.getUTCDate() };
  }

  private watMinutesToUtc(d: { y: number; m: number; d: number }, minutes: number) {
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    return new Date(Date.UTC(d.y, d.m, d.d, hh, mm) - WAT_OFFSET_MS);
  }

  private ymd(d: { y: number; m: number; d: number }) {
    return `${d.y}${String(d.m + 1).padStart(2, '0')}${String(d.d).padStart(2, '0')}`;
  }
}