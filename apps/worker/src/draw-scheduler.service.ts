import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  DrawPrizeModel,
  DrawStatus,
  DrawType,
  DrawTemplate,
  Prisma,
  Product,
} from '@prisma/client';
import { PrismaService } from './prisma.service';

const SWEEP_MS = 5 * 60_000;
const WAT_OFFSET_MS = 60 * 60 * 1000;
const HORIZON_DAYS = 7; // create draws for the coming week

type TemplateWithProduct = DrawTemplate & { product: Product | null };

type ProductTier = {
  tierNo: number;
  name: string;
  active: boolean;
  allocationBp?: number | null;
  winnerCount?: number | null;
  prizePerWinnerNgn: number;
  prizeDescription?: string | null;
  itemPrize?: boolean | null;
};

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
  // Product schedules only count while their product is approved and on.
  private async activeTemplates(now: Date): Promise<TemplateWithProduct[]> {
    const rows = await this.prisma.drawTemplate.findMany({
      where: {
        status: 'ACTIVE',
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      include: { product: true },
      orderBy: [{ templateType: 'asc' }, { version: 'desc' }],
    });
    return rows.filter((t) => !t.productId || (t.product?.active && t.product.approvedAt));
  }

  private async ensureFromTemplate(
    t: TemplateWithProduct,
    watDate: { y: number; m: number; d: number },
    now: Date,
  ) {
    if (t.product) {
      await this.ensureProductDraw(t, t.product, watDate, now);
      return;
    }

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

  // One draw per product, per slot, per day. It copies the product's price
  // and prize setup; changes approved later reach it until sales open.
  private async ensureProductDraw(
    t: DrawTemplate,
    product: Product,
    watDate: { y: number; m: number; d: number },
    now: Date,
  ) {
    const scheduledAt = this.watMinutesToUtc(watDate, t.scheduledMinutesWat);
    const cutoffAt = this.watMinutesToUtc(watDate, t.cutoffMinutesWat);
    if (cutoffAt.getTime() <= now.getTime()) return;

    let salesOpenAt: Date | null = null;
    if (t.salesOpenMinutesWat != null) {
      const openDay = t.salesOpenPreviousDay ? this.addDays(watDate, -1) : watDate;
      salesOpenAt = this.watMinutesToUtc(openDay, t.salesOpenMinutesWat);
    }

    const tiers = (product.prizeTiers as unknown as ProductTier[]) ?? [];
    const drawCode = `RD-${product.code}-${this.ymd(watDate)}-${t.slotCode ?? 'DRAW'}`;

    try {
      const draw = await this.prisma.draw.create({
        data: {
          drawCode,
          drawType: product.kind,
          status: DrawStatus.SCHEDULED,
          productId: product.productId,
          slotCode: t.slotCode,
          prizeDescription: product.prizeDescription,
          prizeValueNgn: headlinePrizeNgn(product, tiers),
          prizeModel: product.prizeModel,
          poolPayoutBp: product.poolPayoutBp,
          poolMinimumNgn: product.poolMinimumNgn,
          poolRevenueBasis: product.poolRevenueBasis,
          ticketPriceNgn: product.ticketPriceNgn,
          ticketQuota: t.ticketQuota,
          salesOpenAt,
          scheduledAt,
          cutoffAt,
          prizeTiers: {
            create: tiers.map((tier) => ({
              tierNo: tier.tierNo,
              name: tier.name,
              active: tier.active,
              allocationBp: tier.allocationBp ?? null,
              winnerCount: tier.winnerCount ?? null,
              prizePerWinnerNgn: tier.prizePerWinnerNgn,
              prizeDescription: tier.prizeDescription ?? null,
              itemPrize: !!tier.itemPrize,
            })),
          },
        },
      });

      await this.prisma.auditLog.create({
        data: {
          severity: AuditSeverity.INFO,
          actorType: AuditActorType.SYSTEM,
          action: 'DRAW_AUTO_SCHEDULED',
          resourceType: 'Draw',
          resourceId: draw.drawId,
          metadata: {
            drawCode,
            drawType: product.kind,
            productId: product.productId,
            productCode: product.code,
            productVersion: product.version,
            slotCode: t.slotCode,
            templateId: t.templateId,
            templateVersion: t.version,
          } as Prisma.InputJsonValue,
        },
      });

      this.logger.log(`Auto-scheduled ${drawCode} (${product.name}) from template ${t.templateId} v${t.version}`);
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error; // exists → fine
    }
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

  private addDays(d: { y: number; m: number; d: number }, days: number) {
    const t = new Date(Date.UTC(d.y, d.m, d.d) + days * 86_400_000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
  }

  private ymd(d: { y: number; m: number; d: number }) {
    return `${d.y}${String(d.m + 1).padStart(2, '0')}${String(d.d).padStart(2, '0')}`;
  }
}

// The headline a draw shows: the guaranteed minimum pool, or what every
// active jackpot stage pays.
function headlinePrizeNgn(product: Product, tiers: ProductTier[]): number {
  if (product.prizeModel === DrawPrizeModel.POOL) return Math.max(0, product.poolMinimumNgn ?? 0);
  return tiers
    .filter((t) => t.active)
    .reduce((sum, t) => sum + (t.winnerCount ?? 0) * t.prizePerWinnerNgn, 0);
}
