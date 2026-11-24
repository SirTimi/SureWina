import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdminRole,
  AdminTier,
  AuditActorType,
  AuditSeverity,
  DrawPrizeModel,
  DrawReleaseStatus,
  DrawStatus,
  DrawType,
  JackpotEntryStatus,
  PaymentStatus,
  Prisma,
  PurchaseChannel,
  TicketStatus,
  WalletPurchaseStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { verify as verifyTotp } from 'otplib';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { drawSnapshotHash } from './draw-snapshot';
import { formatBp, planPrizes, validatePrizeConfig } from './prize-pool.math';

const TICK_MS = 30_000;

export type ReleaseCheck = {
  code: string;
  label: string;
  ok: boolean;
  // A failed blocking check stops the draw being approved at all.
  blocking: boolean;
  detail: string;
};

export type Approver = { sub: string; role: AdminRole; tier: AdminTier };

// Phase 2 — the two approval gates around every draw.
//
// Gate 1, before sales open: a draw's setup must be approved. Product draws
// carry their product's and schedule's approvals; a draw set up by hand
// needs a different senior admin. Sales never open without it (engine).
//
// Gate 2, after sales close: the system reconciles the draw (seed sealed
// before sales, nothing sold after the cutoff, every ticket paid for, prize
// setup valid and locked) and fingerprints its exact entries and prizes. If
// a blocking check fails, the draw is held and cannot be approved. If all
// pass, an approver reviews and approves with their password and two-factor
// code. The engine runs only an approved draw whose fingerprint still
// matches. Nobody can change who wins: the seed was sealed before sales.
//
// If approval is not given within DRAW_RELEASE_ESCALATE_MINUTES of the
// cutoff, the draw is escalated (CRITICAL audit and a notification to every
// approver). The draw waits; it is never run without approval.
//
// Settings:
//   DRAW_RELEASE_APPROVAL_REQUIRED  (default true; false = auto-approve when
//                                    every check passes)
//   DRAW_RELEASE_APPROVER_TIERS     (default SUPER)
//   DRAW_RELEASE_APPROVER_ROLES     (default: any role)
//   DRAW_RELEASE_ESCALATE_MINUTES   (default 30)
@Injectable()
export class DrawReleaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DrawReleaseService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log(
      `Draw approvals started (approval ${this.approvalRequired() ? 'required' : 'automatic when checks pass'}; approvers: ${this.approverTiers().join('/')}${this.approverRoles().length ? ` in ${this.approverRoles().join('/')}` : ''})`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ─── settings ─────────────────────────────────────────────

  approvalRequired(): boolean {
    return this.config.get<boolean>('DRAW_RELEASE_APPROVAL_REQUIRED') !== false;
  }

  approverTiers(): AdminTier[] {
    return list(this.config.get<string>('DRAW_RELEASE_APPROVER_TIERS') ?? 'SUPER') as AdminTier[];
  }

  approverRoles(): AdminRole[] {
    return list(this.config.get<string>('DRAW_RELEASE_APPROVER_ROLES') ?? '') as AdminRole[];
  }

  escalateMinutes(): number {
    const n = Number(this.config.get('DRAW_RELEASE_ESCALATE_MINUTES') ?? 30);
    return Number.isFinite(n) && n > 0 ? n : 30;
  }

  canApprove(admin: Pick<Approver, 'role' | 'tier'>): boolean {
    const roles = this.approverRoles();
    return this.approverTiers().includes(admin.tier) && (roles.length === 0 || roles.includes(admin.role));
  }

  // ─── loop ─────────────────────────────────────────────────

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const closed = await this.prisma.draw.findMany({
        where: { status: DrawStatus.SALES_CLOSED, release: null },
        select: { drawId: true },
        take: 20,
      });
      for (const { drawId } of closed) {
        await this.runChecks(drawId, null).catch((e) =>
          this.logger.error(`Checks for ${drawId} failed to run: ${e instanceof Error ? e.message : 'unknown'}`),
        );
      }
      await this.escalateOverdue();
    } finally {
      this.running = false;
    }
  }

  private async escalateOverdue(): Promise<void> {
    const cutoff = new Date(Date.now() - this.escalateMinutes() * 60_000);
    const overdue = await this.prisma.drawRelease.findMany({
      where: {
        status: { in: [DrawReleaseStatus.AWAITING_APPROVAL, DrawReleaseStatus.CHECKS_FAILED] },
        escalatedAt: null,
        draw: { status: DrawStatus.SALES_CLOSED, cutoffAt: { lte: cutoff } },
      },
      include: { draw: { select: { drawCode: true, scheduledAt: true } } },
    });
    for (const r of overdue) {
      const marked = await this.prisma.drawRelease.updateMany({
        where: { releaseId: r.releaseId, escalatedAt: null },
        data: { escalatedAt: new Date() },
      });
      if (marked.count !== 1) continue;
      await this.writeAudit(AuditSeverity.CRITICAL, { type: AuditActorType.SYSTEM, id: 'draw-approvals' }, 'DRAW_RELEASE_ESCALATED', r.drawId, {
        drawCode: r.draw.drawCode,
        status: r.status,
        scheduledAt: r.draw.scheduledAt.toISOString(),
        minutesAfterCutoff: this.escalateMinutes(),
      });
    }
  }

  // ─── Gate 2: checks ───────────────────────────────────────

  async runChecks(drawId: string, actor: { type: AuditActorType; id: string } | null) {
    const draw = await this.prisma.draw.findUnique({
      where: { drawId },
      include: { seedCommit: true, prizeTiers: true, release: true },
    });
    if (!draw) throw new NotFoundException('Draw not found');
    if (draw.status !== DrawStatus.SALES_CLOSED) {
      throw new ConflictException('Checks run once sales have closed and before the draw runs');
    }
    if (draw.release?.status === DrawReleaseStatus.APPROVED) {
      throw new ConflictException('This draw is already approved');
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { drawId, status: TicketStatus.ACTIVE },
      select: {
        ticketRef: true,
        faceValueNgn: true,
        createdAt: true,
        purchaseChannel: true,
        agentId: true,
        paymentTxnId: true,
        walletPurchaseId: true,
        payment: { select: { status: true } },
        walletPurchase: { select: { status: true } },
      },
    });
    // Free jackpot entries count only in jackpot draws (as in the engine).
    const entries = draw.drawType === DrawType.SATURDAY_JACKPOT
      ? await this.prisma.jackpotEntry.findMany({
          where: { drawId, status: JackpotEntryStatus.ACTIVE },
          select: { entryId: true },
        })
      : [];
    const pendingWalletPurchases = await this.prisma.walletPurchase.count({
      where: { drawId, status: { in: [WalletPurchaseStatus.PENDING, WalletPurchaseStatus.REVIEW_REQUIRED] } },
    });

    const salesNgn = tickets.reduce((s, t) => s + t.faceValueNgn, 0);
    const checks = buildChecks({ draw, tickets, entries: entries.length, pendingWalletPurchases, salesNgn });
    const snapshotHash = drawSnapshotHash({
      drawId: draw.drawId,
      drawCode: draw.drawCode,
      ticketPriceNgn: draw.ticketPriceNgn,
      prizeModel: draw.prizeModel,
      poolPayoutBp: draw.poolPayoutBp,
      poolMinimumNgn: draw.poolMinimumNgn,
      poolRevenueBasis: draw.poolRevenueBasis,
      prizeValueNgn: draw.prizeValueNgn,
      tiers: draw.prizeTiers,
      ticketRefs: tickets.map((t) => t.ticketRef),
      entryIds: entries.map((e) => e.entryId),
    });

    const blocked = checks.some((c) => c.blocking && !c.ok);
    const autoApprove = !blocked && !this.approvalRequired();
    const status = blocked
      ? DrawReleaseStatus.CHECKS_FAILED
      : autoApprove
        ? DrawReleaseStatus.APPROVED
        : DrawReleaseStatus.AWAITING_APPROVAL;
    const now = new Date();

    const data = {
      status,
      checks: checks as unknown as Prisma.InputJsonValue,
      snapshotHash,
      tickets: tickets.length,
      entries: entries.length,
      salesNgn,
      checkedAt: now,
      approvedBy: autoApprove ? 'system:approval-not-required' : null,
      approvedAt: autoApprove ? now : null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      invalidatedAt: null,
    };

    const release = draw.release
      ? await this.prisma.drawRelease.update({
          where: { drawId },
          data: { ...data, checkRuns: { increment: 1 } },
        })
      : await this.prisma.drawRelease.create({ data: { drawId, ...data } });

    await this.writeAudit(
      blocked ? AuditSeverity.CRITICAL : AuditSeverity.INFO,
      actor ?? { type: AuditActorType.SYSTEM, id: 'draw-approvals' },
      blocked ? 'DRAW_RELEASE_CHECKS_FAILED' : autoApprove ? 'DRAW_RELEASE_AUTO_APPROVED' : 'DRAW_RELEASE_READY_FOR_APPROVAL',
      drawId,
      {
        drawCode: draw.drawCode,
        snapshotHash,
        tickets: tickets.length,
        salesNgn,
        failed: checks.filter((c) => !c.ok).map((c) => c.code),
        run: release.checkRuns,
      },
    );

    return release;
  }

  // ─── Gate 2: decisions ────────────────────────────────────

  async approve(drawId: string, admin: Approver, password: string, mfaCode: string) {
    this.requireApprover(admin);
    const release = await this.prisma.drawRelease.findUnique({ where: { drawId } });
    if (!release) throw new NotFoundException('This draw has not been checked yet');
    if (release.status !== DrawReleaseStatus.AWAITING_APPROVAL) {
      throw new ConflictException(
        release.status === DrawReleaseStatus.CHECKS_FAILED
          ? 'A required check failed. Fix it and run the checks again before approving.'
          : `This draw is ${release.status.toLowerCase().replace('_', ' ')}, not awaiting approval`,
      );
    }

    await this.reconfirm(admin.sub, password, mfaCode, drawId);

    // The approval is for exactly what was checked.
    const current = await this.currentSnapshot(drawId);
    if (current !== release.snapshotHash) {
      await this.runChecks(drawId, { type: AuditActorType.ADMIN, id: admin.sub });
      throw new ConflictException('The draw changed since it was checked. It has been checked again: review it and approve again.');
    }

    const now = new Date();
    const changed = await this.prisma.drawRelease.updateMany({
      where: { drawId, status: DrawReleaseStatus.AWAITING_APPROVAL, snapshotHash: release.snapshotHash },
      data: { status: DrawReleaseStatus.APPROVED, approvedBy: admin.sub, approvedAt: now },
    });
    if (changed.count !== 1) throw new ConflictException('This draw was decided by someone else a moment ago');

    await this.writeAudit(AuditSeverity.CRITICAL, { type: AuditActorType.ADMIN, id: admin.sub }, 'DRAW_RELEASE_APPROVED', drawId, {
      snapshotHash: release.snapshotHash,
      tickets: release.tickets,
      salesNgn: release.salesNgn,
    });
    return this.get(drawId);
  }

  async reject(drawId: string, admin: Approver, reason: string) {
    this.requireApprover(admin);
    const text = (reason ?? '').trim();
    if (text.length < 10) throw new BadRequestException('Give the reason for rejecting (at least 10 characters)');

    const changed = await this.prisma.drawRelease.updateMany({
      where: { drawId, status: { in: [DrawReleaseStatus.AWAITING_APPROVAL, DrawReleaseStatus.CHECKS_FAILED] } },
      data: { status: DrawReleaseStatus.REJECTED, rejectedBy: admin.sub, rejectedAt: new Date(), rejectionReason: text.slice(0, 500) },
    });
    if (changed.count !== 1) throw new ConflictException('This draw is not awaiting a decision');

    await this.writeAudit(AuditSeverity.CRITICAL, { type: AuditActorType.ADMIN, id: admin.sub }, 'DRAW_RELEASE_REJECTED', drawId, { reason: text });
    return this.get(drawId);
  }

  // After a fix (or a rejection that has been investigated), check again.
  async recheck(drawId: string, admin: Approver) {
    this.requireApprover(admin);
    await this.runChecks(drawId, { type: AuditActorType.ADMIN, id: admin.sub });
    return this.get(drawId);
  }

  // ─── Gate 1 ───────────────────────────────────────────────

  // A draw set up by hand: approved by a different senior admin before its
  // sales can open.
  async approveSetup(drawId: string, admin: Approver) {
    if (admin.tier !== AdminTier.SUPER) throw new ForbiddenException('Only a senior admin can approve a draw setup');
    const draw = await this.prisma.draw.findUnique({ where: { drawId } });
    if (!draw) throw new NotFoundException('Draw not found');
    if (draw.status !== DrawStatus.SCHEDULED) throw new ConflictException('Only a draw that has not opened can be approved');
    if (draw.setupApprovedAt) throw new ConflictException('This draw setup is already approved');

    const creator = await this.prisma.auditLog.findFirst({
      where: { action: 'DRAW_CREATED', resourceType: 'Draw', resourceId: drawId },
      select: { actorId: true },
    });
    const lastEditor = await this.prisma.auditLog.findFirst({
      where: { action: 'DRAW_UPDATED', resourceType: 'Draw', resourceId: drawId },
      orderBy: { seq: 'desc' },
      select: { actorId: true },
    });
    if (creator?.actorId === admin.sub || lastEditor?.actorId === admin.sub) {
      throw new ConflictException('A draw setup must be approved by a different admin than the one who set it up or last changed it');
    }

    const changed = await this.prisma.draw.updateMany({
      where: { drawId, status: DrawStatus.SCHEDULED, setupApprovedAt: null, configVersion: draw.configVersion },
      data: { setupApprovedAt: new Date(), setupApprovedBy: admin.sub },
    });
    if (changed.count !== 1) throw new ConflictException('The draw changed a moment ago; review it again');

    await this.writeAudit(AuditSeverity.WARNING, { type: AuditActorType.ADMIN, id: admin.sub }, 'DRAW_SETUP_APPROVED', drawId, {
      drawCode: draw.drawCode,
      configVersion: draw.configVersion,
    });
    return { drawId, setupApprovedAt: new Date().toISOString() };
  }

  // ─── views ────────────────────────────────────────────────

  async get(drawId: string) {
    const draw = await this.prisma.draw.findUnique({
      where: { drawId },
      include: { release: true, prizeTiers: { orderBy: { tierNo: 'asc' } }, product: { select: { name: true, code: true } } },
    });
    if (!draw) throw new NotFoundException('Draw not found');
    const r = draw.release;

    // What the draw would pay at these sales (gross), for the approver.
    let plan: ReturnType<typeof planPrizes> | null = null;
    if (r && (draw.prizeModel === DrawPrizeModel.POOL || draw.prizeModel === DrawPrizeModel.STAGES)) {
      try {
        plan = planPrizes(
          { model: draw.prizeModel, payoutBp: draw.poolPayoutBp, minimumNgn: draw.poolMinimumNgn, tiers: draw.prizeTiers },
          r.salesNgn,
        );
      } catch {
        plan = null;
      }
    }

    return {
      drawId: draw.drawId,
      drawCode: draw.drawCode,
      productName: draw.product?.name ?? null,
      status: draw.status,
      scheduledAt: draw.scheduledAt.toISOString(),
      cutoffAt: draw.cutoffAt.toISOString(),
      setupApprovedAt: draw.setupApprovedAt?.toISOString() ?? null,
      prizeModel: draw.prizeModel,
      payoutRatio: draw.poolPayoutBp ? formatBp(draw.poolPayoutBp) : null,
      poolMinimumNgn: draw.poolMinimumNgn,
      poolRevenueBasis: draw.poolRevenueBasis,
      release: r
        ? {
            status: r.status,
            checks: r.checks as unknown as ReleaseCheck[],
            snapshotHash: r.snapshotHash,
            tickets: r.tickets,
            entries: r.entries,
            salesNgn: r.salesNgn,
            checkedAt: r.checkedAt.toISOString(),
            checkRuns: r.checkRuns,
            approvedBy: r.approvedBy,
            approvedAt: r.approvedAt?.toISOString() ?? null,
            rejectedBy: r.rejectedBy,
            rejectedAt: r.rejectedAt?.toISOString() ?? null,
            rejectionReason: r.rejectionReason,
            escalatedAt: r.escalatedAt?.toISOString() ?? null,
            invalidatedAt: r.invalidatedAt?.toISOString() ?? null,
          }
        : null,
      // Estimate at gross sales; the engine applies the draw's revenue rule.
      plan,
    };
  }

  // Everything waiting for a person: setups to approve and closed draws.
  async pending() {
    const [setups, releases] = await Promise.all([
      this.prisma.draw.findMany({
        where: { status: DrawStatus.SCHEDULED, setupApprovedAt: null },
        orderBy: { scheduledAt: 'asc' },
        select: { drawId: true, drawCode: true, scheduledAt: true, cutoffAt: true, ticketPriceNgn: true, prizeDescription: true, prizeModel: true },
        take: 100,
      }),
      this.prisma.draw.findMany({
        where: { status: DrawStatus.SALES_CLOSED },
        orderBy: { scheduledAt: 'asc' },
        include: { release: true, product: { select: { name: true } } },
        take: 100,
      }),
    ]);

    return {
      approvalRequired: this.approvalRequired(),
      approvers: { tiers: this.approverTiers(), roles: this.approverRoles() },
      escalateMinutes: this.escalateMinutes(),
      setups: setups.map((d) => ({ ...d, scheduledAt: d.scheduledAt.toISOString(), cutoffAt: d.cutoffAt.toISOString() })),
      closedDraws: releases.map((d) => ({
        drawId: d.drawId,
        drawCode: d.drawCode,
        productName: d.product?.name ?? null,
        scheduledAt: d.scheduledAt.toISOString(),
        cutoffAt: d.cutoffAt.toISOString(),
        releaseStatus: d.release?.status ?? 'CHECKING',
        tickets: d.release?.tickets ?? null,
        salesNgn: d.release?.salesNgn ?? null,
        failedChecks: d.release ? (d.release.checks as unknown as ReleaseCheck[]).filter((c) => !c.ok && c.blocking).length : 0,
        escalated: !!d.release?.escalatedAt,
      })),
    };
  }

  // Every ticket in the draw, for the approver to inspect (CSV).
  async reportCsv(drawId: string): Promise<string> {
    const draw = await this.prisma.draw.findUnique({ where: { drawId }, select: { drawCode: true } });
    if (!draw) throw new NotFoundException('Draw not found');
    const tickets = await this.prisma.ticket.findMany({
      where: { drawId },
      orderBy: { ticketRef: 'asc' },
      select: {
        ticketRef: true,
        status: true,
        faceValueNgn: true,
        purchaseChannel: true,
        stateOfPlayCode: true,
        createdAt: true,
        agent: { select: { agentCode: true } },
        payment: { select: { gatewayReference: true, status: true } },
        walletPurchase: { select: { purchaseId: true, status: true } },
      },
    });
    const rows = [
      ['Ticket', 'Status', 'Price (NGN)', 'Channel', 'Agent', 'State', 'Sold at', 'Paid by', 'Payment reference', 'Payment status'],
      ...tickets.map((t) => [
        t.ticketRef,
        t.status,
        String(t.faceValueNgn),
        t.purchaseChannel,
        t.agent?.agentCode ?? '',
        t.stateOfPlayCode,
        t.createdAt.toISOString(),
        t.payment ? 'Payment' : 'Wallet',
        t.payment?.gatewayReference ?? t.walletPurchase?.purchaseId ?? '',
        t.payment?.status ?? t.walletPurchase?.status ?? '',
      ]),
    ];
    return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  // ─── helpers ──────────────────────────────────────────────

  private requireApprover(admin: Approver) {
    if (!this.canApprove(admin)) {
      throw new ForbiddenException('You are not one of the draw approvers');
    }
  }

  // Password and two-factor code, entered at the moment of approving.
  private async reconfirm(adminUserId: string, password: string, mfaCode: string, drawId: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { adminUserId } });
    if (!admin || !admin.isActive) throw new UnauthorizedException('Admin not found');
    if (!admin.mfaEnabled || !admin.mfaSecret) {
      throw new ForbiddenException('Set up two-factor sign-in on your account before approving draws');
    }

    const passwordOk = await bcrypt.compare(password ?? '', admin.passwordHash);
    const codeOk = passwordOk
      ? (await verifyTotp({ secret: admin.mfaSecret, token: (mfaCode ?? '').trim(), epochTolerance: 30 })).valid
      : false;

    if (!passwordOk || !codeOk) {
      await this.writeAudit(AuditSeverity.WARNING, { type: AuditActorType.ADMIN, id: adminUserId }, 'DRAW_RELEASE_RECONFIRM_FAILED', drawId, {
        reason: passwordOk ? 'two-factor code' : 'password',
      });
      throw new UnauthorizedException('Password or two-factor code is incorrect');
    }
  }

  private async currentSnapshot(drawId: string): Promise<string> {
    const draw = await this.prisma.draw.findUniqueOrThrow({ where: { drawId }, include: { prizeTiers: true } });
    const [tickets, entries] = await Promise.all([
      this.prisma.ticket.findMany({ where: { drawId, status: TicketStatus.ACTIVE }, select: { ticketRef: true } }),
      draw.drawType === DrawType.SATURDAY_JACKPOT
        ? this.prisma.jackpotEntry.findMany({ where: { drawId, status: JackpotEntryStatus.ACTIVE }, select: { entryId: true } })
        : Promise.resolve([] as { entryId: string }[]),
    ]);
    return drawSnapshotHash({
      drawId: draw.drawId,
      drawCode: draw.drawCode,
      ticketPriceNgn: draw.ticketPriceNgn,
      prizeModel: draw.prizeModel,
      poolPayoutBp: draw.poolPayoutBp,
      poolMinimumNgn: draw.poolMinimumNgn,
      poolRevenueBasis: draw.poolRevenueBasis,
      prizeValueNgn: draw.prizeValueNgn,
      tiers: draw.prizeTiers,
      ticketRefs: tickets.map((t) => t.ticketRef),
      entryIds: entries.map((e) => e.entryId),
    });
  }

  private async writeAudit(
    severity: AuditSeverity,
    actor: { type: AuditActorType; id: string },
    action: string,
    drawId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.audit
      .write({ severity, actor, action, resource: { type: 'Draw', id: drawId }, metadata })
      .catch(() => undefined);
  }
}

// The checks, as plain rules. Exported for tests.
export function buildChecks(input: {
  draw: {
    status: DrawStatus;
    salesOpenAt: Date | null;
    cutoffAt: Date;
    setupApprovedAt: Date | null;
    prizeModel: DrawPrizeModel;
    poolPayoutBp: number | null;
    poolMinimumNgn: number | null;
    prizeConfigLockedAt: Date | null;
    seedCommit: { committedAt: Date } | null;
    prizeTiers: Array<{ tierNo: number; name: string; active: boolean; allocationBp: number | null; winnerCount: number | null; prizePerWinnerNgn: number; itemPrize: boolean }>;
  };
  tickets: Array<{
    ticketRef: string;
    createdAt: Date;
    purchaseChannel: PurchaseChannel;
    agentId: string | null;
    paymentTxnId: string | null;
    walletPurchaseId: string | null;
    payment: { status: PaymentStatus } | null;
    walletPurchase: { status: WalletPurchaseStatus } | null;
  }>;
  entries: number;
  pendingWalletPurchases: number;
  salesNgn: number;
}): ReleaseCheck[] {
  const { draw, tickets } = input;
  const checks: ReleaseCheck[] = [];
  const add = (code: string, label: string, ok: boolean, blocking: boolean, detail: string) =>
    checks.push({ code, label, ok, blocking, detail });

  add('SETUP_APPROVED', 'Draw setup was approved before sales', !!draw.setupApprovedAt, true,
    draw.setupApprovedAt ? `Approved ${wat(draw.setupApprovedAt)}` : 'No setup approval on record');

  const firstSale = tickets.reduce<Date | null>((min, t) => (!min || t.createdAt < min ? t.createdAt : min), null);
  const salesStart = [draw.salesOpenAt, firstSale].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const seedOk = !!draw.seedCommit && (!salesStart || draw.seedCommit.committedAt <= salesStart);
  add('SEED_SEALED_BEFORE_SALES', 'Random seed was sealed before any ticket was sold', seedOk, true,
    !draw.seedCommit ? 'No sealed seed' : `Sealed ${wat(draw.seedCommit.committedAt)}${salesStart ? `, sales from ${wat(salesStart)}` : ''}`);

  const late = tickets.filter((t) => t.createdAt > draw.cutoffAt);
  add('NO_SALES_AFTER_CUTOFF', 'No ticket was sold after the cutoff', late.length === 0, true,
    late.length === 0 ? `Cutoff ${wat(draw.cutoffAt)}` : `${late.length} ticket(s) after the cutoff, e.g. ${late.slice(0, 3).map((t) => t.ticketRef).join(', ')}`);

  const unpaid = tickets.filter((t) =>
    t.paymentTxnId ? t.payment?.status !== PaymentStatus.CONFIRMED : t.walletPurchase?.status !== WalletPurchaseStatus.COMPLETED,
  );
  add('EVERY_TICKET_PAID', 'Every ticket has a confirmed payment or wallet purchase', unpaid.length === 0, true,
    unpaid.length === 0 ? `${tickets.length} ticket(s), all paid` : `${unpaid.length} ticket(s) without a confirmed payment, e.g. ${unpaid.slice(0, 3).map((t) => t.ticketRef).join(', ')}`);

  const agentless = tickets.filter((t) => t.purchaseChannel === PurchaseChannel.AGENT && !t.agentId);
  add('AGENT_SALES_RECORDED', 'Every agent sale is linked to its agent', agentless.length === 0, true,
    agentless.length === 0 ? `${tickets.filter((t) => t.purchaseChannel === PurchaseChannel.AGENT).length} agent ticket(s)` : `${agentless.length} agent ticket(s) with no agent`);

  if (draw.prizeModel === DrawPrizeModel.POOL || draw.prizeModel === DrawPrizeModel.STAGES) {
    const errors = validatePrizeConfig({ model: draw.prizeModel, payoutBp: draw.poolPayoutBp, minimumNgn: draw.poolMinimumNgn, tiers: draw.prizeTiers });
    add('PRIZE_SETUP_VALID_AND_LOCKED', 'Prize setup is valid and was locked when sales opened', errors.length === 0 && !!draw.prizeConfigLockedAt, true,
      errors.length > 0 ? errors.join('; ') : draw.prizeConfigLockedAt ? `Locked ${wat(draw.prizeConfigLockedAt)}` : 'Not locked');

    if (draw.prizeModel === DrawPrizeModel.POOL && draw.poolPayoutBp) {
      const share = Math.floor((input.salesNgn * draw.poolPayoutBp) / 10000);
      const topUp = Math.max(0, (draw.poolMinimumNgn ?? 0) - share);
      add('POOL_FUNDING', 'Prize pool is covered by sales', topUp === 0, false,
        topUp === 0 ? `Payout share ₦${share.toLocaleString('en-NG')} covers the minimum` : `Company top-up of ₦${topUp.toLocaleString('en-NG')} needed to reach the minimum pool (approximate, at gross sales)`);
    }
  }

  add('NO_PENDING_PURCHASES', 'No wallet purchase for this draw is still unresolved', input.pendingWalletPurchases === 0, false,
    input.pendingWalletPurchases === 0 ? 'None pending' : `${input.pendingWalletPurchases} pending or under review (they are not in the draw)`);

  add('HAS_ENTRIES', 'The draw has entries', tickets.length + input.entries > 0, false,
    `${tickets.length} ticket(s), ${input.entries} free jackpot entr${input.entries === 1 ? 'y' : 'ies'}`);

  return checks;
}

// Nigerian time for people reading the checks, e.g. "24 Nov 2026, 11:00 WAT".
function wat(d: Date): string {
  return `${d.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} WAT`;
}

function list(value: string): string[] {
  return value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
}
