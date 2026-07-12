import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditActorType, AuditSeverity, DrawStatus, DrawType } from '@prisma/client';
import { PrismaService } from './prisma.service';

const SWEEP_MS = 5 * 60_000;
const WAT_OFFSET_MS = 60 * 60 * 1000;

// Keeps the storefront stocked: ensures a DAILY_STANDARD draw exists for
// today and tomorrow (WAT), and a SATURDAY_JACKPOT for the coming Saturday.
// Catch-up style + idempotent on the unique drawCode, so downtime self-heals
// and concurrent ticks can't double-create. The engine then commits seeds
// and activates as usual — the pipeline becomes fully self-sustaining.
@Injectable()
export class DrawSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DrawSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), SWEEP_MS);
    void this.tick();
    this.logger.log('Draw scheduler started (every 5m)');
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const todayWat = this.watDate(now);
      const tomorrowWat = this.watDate(new Date(now.getTime() + 86_400_000));

      await this.ensureDaily(todayWat, now);
      await this.ensureDaily(tomorrowWat, now);
      await this.ensureJackpot(this.nextSaturday(now), now);
    } catch (error) {
      this.logger.error(
        `Draw scheduler failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }

  // ── ensure one daily draw for the given WAT calendar date ──
  private async ensureDaily(watDate: { y: number; m: number; d: number }, now: Date) {
    // 20:00 WAT draw, 19:00 WAT cutoff → 19:00Z / 18:00Z
    const scheduledAt = this.watTimeToUtc(watDate, 20, 0);
    const cutoffAt = this.watTimeToUtc(watDate, 19, 0);
    if (cutoffAt.getTime() <= now.getTime()) return; // day's window already past

    await this.createIfMissing({
      drawCode: `RD-DRAW-${this.ymd(watDate)}-DAILY`,
      drawType: DrawType.DAILY_STANDARD,
      prizeDescription: this.config.get('SCHED_DAILY_PRIZE_DESC') ?? 'Daily Surewina draw prize',
      prizeValueNgn: Number(this.config.get('SCHED_DAILY_PRIZE_NGN') ?? 500000),
      ticketPriceNgn: Number(this.config.get('SCHED_DAILY_TICKET_NGN') ?? 500),
      scheduledAt,
      cutoffAt,
    });
  }

  private async ensureJackpot(watDate: { y: number; m: number; d: number }, now: Date) {
    // 21:00 WAT draw, 20:00 WAT cutoff
    const scheduledAt = this.watTimeToUtc(watDate, 21, 0);
    const cutoffAt = this.watTimeToUtc(watDate, 20, 0);
    if (cutoffAt.getTime() <= now.getTime()) return;

    await this.createIfMissing({
      drawCode: `RD-DRAW-${this.ymd(watDate)}-JACKPOT`,
      drawType: DrawType.SATURDAY_JACKPOT,
      prizeDescription: this.config.get('SCHED_JACKPOT_PRIZE_DESC') ?? 'Saturday jackpot',
      prizeValueNgn: Number(this.config.get('SCHED_JACKPOT_PRIZE_NGN') ?? 4000000),
      ticketPriceNgn: Number(this.config.get('SCHED_JACKPOT_TICKET_NGN') ?? 5000),
      scheduledAt,
      cutoffAt,
    });
  }

  private async createIfMissing(data: {
    drawCode: string;
    drawType: DrawType;
    prizeDescription: string;
    prizeValueNgn: number;
    ticketPriceNgn: number;
    scheduledAt: Date;
    cutoffAt: Date;
  }) {
    try {
      const draw = await this.prisma.draw.create({
        data: { ...data, status: DrawStatus.SCHEDULED },
      });
      await this.prisma.auditLog.create({
        data: {
          severity: AuditSeverity.INFO,
          actorType: AuditActorType.SYSTEM,
          action: 'DRAW_AUTO_SCHEDULED',
          resourceType: 'Draw',
          resourceId: draw.drawId,
          metadata: { drawCode: data.drawCode, drawType: data.drawType },
        },
      });
      this.logger.log(`Auto-scheduled ${data.drawCode}`);
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error; // exists → fine
    }
  }

  // ── WAT date helpers ──
  private watDate(instant: Date) {
    const w = new Date(instant.getTime() + WAT_OFFSET_MS);
    return { y: w.getUTCFullYear(), m: w.getUTCMonth(), d: w.getUTCDate() };
  }
  private nextSaturday(now: Date) {
    const w = new Date(now.getTime() + WAT_OFFSET_MS);
    const add = (6 - w.getUTCDay() + 7) % 7; // 0 if today IS Saturday
    return this.watDate(new Date(now.getTime() + add * 86_400_000));
  }
  private watTimeToUtc(d: { y: number; m: number; d: number }, hh: number, mm: number) {
    return new Date(Date.UTC(d.y, d.m, d.d, hh, mm) - WAT_OFFSET_MS);
  }
  private ymd(d: { y: number; m: number; d: number }) {
    return `${d.y}${String(d.m + 1).padStart(2, '0')}${String(d.d).padStart(2, '0')}`;
  }
}