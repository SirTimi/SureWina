import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingPeriodStatus,
  AdminRole,
  AdminTier,
  AuditActorType,
  AuditSeverity,
  LedgerAccountType,
  LedgerOwnerType,
  Prisma,
  RetainedPrizeKind,
} from '@prisma/client';
import { createHash } from 'crypto';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';

export type AccountingAdmin = { sub: string; role: AdminRole; tier: AdminTier };

export type TrialBalanceLine = {
  code: string;
  name: string;
  type: LedgerAccountType;
  glCode: string | null;
  glName: string | null;
  debitNgn: number;
  creditNgn: number;
};

const WAT_OFFSET_MS = 60 * 60 * 1000;
const UNMAPPED = 'UNMAPPED';

// Phase 3 — the accounting framework around the existing double-entry
// ledger. Nothing here changes how money is posted.
//
//  - Month close: finance proposes, a different senior admin approves. The
//    month's trial balance is frozen (with a fingerprint) and a database
//    trigger refuses any posting dated in a closed month.
//  - Chart of accounts: each SureWina ledger account maps to the
//    consultant's general-ledger code (maker-checker).
//  - Exports: the journal (summary and detail) with a product on every line,
//    and a profit and loss by product, for any accounting package.
@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── periods ──────────────────────────────────────────────

  async listPeriods() {
    const rows = await this.prisma.accountingPeriod.findMany({ orderBy: { period: 'desc' } });
    const byPeriod = new Map(rows.map((r) => [r.period, r]));
    // The last 12 months, plus any older month that has a record.
    const months = new Set<string>(rows.map((r) => r.period));
    let cursor = currentMonth();
    for (let i = 0; i < 12; i++) {
      months.add(cursor);
      cursor = previousMonth(cursor);
    }
    return {
      currentMonth: currentMonth(),
      periods: [...months].sort().reverse().map((period) => {
        const r = byPeriod.get(period);
        return {
          period,
          status: r?.status ?? AccountingPeriodStatus.OPEN,
          ended: monthRange(period).end.getTime() <= Date.now(),
          proposedBy: r?.proposedBy ?? null,
          proposedAt: r?.proposedAt?.toISOString() ?? null,
          closedBy: r?.closedBy ?? null,
          closedAt: r?.closedAt?.toISOString() ?? null,
          snapshotHash: r?.snapshotHash ?? null,
          closeCount: r?.closeCount ?? 0,
          reopenedAt: r?.reopenedAt?.toISOString() ?? null,
          reopenReason: r?.reopenReason ?? null,
        };
      }),
    };
  }

  async proposeClose(period: string, admin: AccountingAdmin) {
    requirePeriod(period);
    requireFinance(admin);
    if (monthRange(period).end.getTime() > Date.now()) {
      throw new ConflictException('A month can be closed only after it has ended');
    }
    const existing = await this.prisma.accountingPeriod.findUnique({ where: { period } });
    if (existing && existing.status !== AccountingPeriodStatus.OPEN) {
      throw new ConflictException(`This month is already ${existing.status === 'CLOSED' ? 'closed' : 'awaiting approval to close'}`);
    }
    await this.prisma.accountingPeriod.upsert({
      where: { period },
      create: { period, status: AccountingPeriodStatus.CLOSE_PROPOSED, proposedBy: admin.sub, proposedAt: new Date() },
      update: { status: AccountingPeriodStatus.CLOSE_PROPOSED, proposedBy: admin.sub, proposedAt: new Date() },
    });
    await this.writeAudit(AuditSeverity.WARNING, admin.sub, 'ACCOUNTING_PERIOD_CLOSE_PROPOSED', period, {});
    return this.getPeriod(period);
  }

  // Freezes the month's trial balance and closes it, in one transaction
  // that briefly blocks new postings so nothing slips in between.
  async approveClose(period: string, admin: AccountingAdmin) {
    requirePeriod(period);
    if (admin.tier !== AdminTier.SUPER) throw new ForbiddenException('Only a senior admin can approve closing a month');

    const closed = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('LOCK TABLE "ledger_transactions" IN SHARE MODE');
      const row = await tx.accountingPeriod.findUnique({ where: { period } });
      if (!row || row.status !== AccountingPeriodStatus.CLOSE_PROPOSED) {
        throw new ConflictException('Closing this month has not been proposed');
      }
      if (row.proposedBy === admin.sub) {
        throw new ConflictException('Closing a month must be approved by a different admin than the one who proposed it');
      }
      const lines = await this.trialBalanceAsAt(tx, monthRange(period).end);
      const snapshotHash = hashLines(period, lines);
      const now = new Date();
      await tx.accountingPeriod.update({
        where: { period },
        data: {
          status: AccountingPeriodStatus.CLOSED,
          closedBy: admin.sub,
          closedAt: now,
          trialBalance: lines as unknown as Prisma.InputJsonValue,
          snapshotHash,
          closeCount: { increment: 1 },
        },
      });
      return { snapshotHash, lines };
    });

    const totals = sumLines(closed.lines);
    await this.writeAudit(AuditSeverity.CRITICAL, admin.sub, 'ACCOUNTING_PERIOD_CLOSED', period, {
      snapshotHash: closed.snapshotHash,
      ...totals,
    });
    return this.getPeriod(period);
  }

  async rejectClose(period: string, reason: string, admin: AccountingAdmin) {
    requirePeriod(period);
    if (admin.tier !== AdminTier.SUPER) throw new ForbiddenException('Only a senior admin can decide on closing a month');
    const changed = await this.prisma.accountingPeriod.updateMany({
      where: { period, status: AccountingPeriodStatus.CLOSE_PROPOSED },
      data: { status: AccountingPeriodStatus.OPEN },
    });
    if (changed.count !== 1) throw new ConflictException('Closing this month has not been proposed');
    await this.writeAudit(AuditSeverity.WARNING, admin.sub, 'ACCOUNTING_PERIOD_CLOSE_REJECTED', period, { reason });
    return this.getPeriod(period);
  }

  // Reopening is exceptional: the frozen trial balance stays on record in the
  // audit log, and the month must be closed again (with a new approval).
  async reopen(period: string, reason: string, admin: AccountingAdmin) {
    requirePeriod(period);
    if (admin.tier !== AdminTier.SUPER) throw new ForbiddenException('Only a senior admin can reopen a closed month');
    const text = (reason ?? '').trim();
    if (text.length < 10) throw new BadRequestException('Give the reason for reopening (at least 10 characters)');
    const row = await this.prisma.accountingPeriod.findUnique({ where: { period } });
    if (!row || row.status !== AccountingPeriodStatus.CLOSED) throw new ConflictException('This month is not closed');

    await this.prisma.accountingPeriod.update({
      where: { period },
      data: {
        status: AccountingPeriodStatus.OPEN,
        proposedBy: null,
        proposedAt: null,
        reopenedBy: admin.sub,
        reopenedAt: new Date(),
        reopenReason: text.slice(0, 500),
      },
    });
    await this.writeAudit(AuditSeverity.CRITICAL, admin.sub, 'ACCOUNTING_PERIOD_REOPENED', period, {
      reason: text,
      previousSnapshotHash: row.snapshotHash,
      previousTrialBalance: row.trialBalance,
    });
    return this.getPeriod(period);
  }

  async getPeriod(period: string) {
    requirePeriod(period);
    const row = await this.prisma.accountingPeriod.findUnique({ where: { period } });
    const live = await this.trialBalanceAsAt(this.prisma, monthRange(period).end);
    const frozen = (row?.trialBalance as unknown as TrialBalanceLine[] | null) ?? null;
    return {
      period,
      status: row?.status ?? AccountingPeriodStatus.OPEN,
      proposedBy: row?.proposedBy ?? null,
      closedBy: row?.closedBy ?? null,
      closedAt: row?.closedAt?.toISOString() ?? null,
      snapshotHash: row?.snapshotHash ?? null,
      // For a closed month: whether the ledger still agrees with what was
      // frozen (it should, unless a month was reopened).
      matchesFrozen: frozen && row?.snapshotHash ? hashLines(period, live) === row.snapshotHash : null,
      trialBalance: frozen ?? live,
      totals: sumLines(frozen ?? live),
    };
  }

  // Balances of every account at a moment (postings before `endExclusive`),
  // rolled up to one line per system account and per purpose for customers'
  // and agents' own accounts.
  async trialBalanceAsAt(db: Prisma.TransactionClient | PrismaService, endExclusive: Date): Promise<TrialBalanceLine[]> {
    const rows = await db.$queryRaw<
      { key: string; name: string; account_type: LedgerAccountType; side: string; amount: bigint | null }[]
    >`SELECT CASE WHEN a.owner_type = 'SYSTEM' THEN a.code ELSE a.purpose::text END AS key,
             CASE WHEN a.owner_type = 'SYSTEM' THEN a.name ELSE initcap(replace(a.purpose::text, '_', ' ')) || ' (all ' || lower(a.owner_type::text) || 's)' END AS name,
             a.account_type, e.side::text AS side, SUM(e.amount_ngn) AS amount
      FROM ledger_entries e
      JOIN ledger_transactions t ON t.ledger_txn_id = e.ledger_txn_id
      JOIN ledger_accounts a ON a.account_id = e.account_id
      WHERE t.occurred_at < ${endExclusive}
      GROUP BY 1, 2, 3, 4`;

    const mappings = await this.mappingsByKey(db);
    const lines = new Map<string, TrialBalanceLine>();
    for (const r of rows) {
      const line = lines.get(r.key) ?? {
        code: r.key,
        name: r.name,
        type: r.account_type,
        glCode: mappings.get(r.key)?.glCode ?? null,
        glName: mappings.get(r.key)?.glName ?? null,
        debitNgn: 0,
        creditNgn: 0,
      };
      if (r.side === 'DEBIT') line.debitNgn += Number(r.amount ?? 0);
      else line.creditNgn += Number(r.amount ?? 0);
      lines.set(r.key, line);
    }
    return [...lines.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  // ─── chart of accounts mapping ───────────────────────────

  async listMappings() {
    const [system, ownPurposes, rows] = await Promise.all([
      this.prisma.ledgerAccount.findMany({
        where: { ownerType: LedgerOwnerType.SYSTEM },
        select: { code: true, name: true, accountType: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.ledgerAccount.groupBy({
        by: ['purpose', 'accountType', 'ownerType'],
        where: { ownerType: { not: LedgerOwnerType.SYSTEM } },
      }),
      this.prisma.glAccountMapping.findMany(),
    ]);
    const byKey = new Map(rows.map((r) => [r.internalKey, r]));
    const keys = [
      ...system.map((a) => ({ key: a.code, name: a.name, type: a.accountType, scope: 'SYSTEM' as const })),
      ...ownPurposes.map((p) => ({
        key: p.purpose as string,
        name: `${titleCase(p.purpose)} (all ${p.ownerType.toLowerCase()}s)`,
        type: p.accountType,
        scope: p.ownerType,
      })),
    ];
    return {
      mappings: keys.map((k) => {
        const m = byKey.get(k.key);
        return {
          internalKey: k.key,
          name: k.name,
          type: k.type,
          scope: k.scope,
          glCode: m?.glCode ?? null,
          glName: m?.glName ?? null,
          pending: m?.pendingProposedAt
            ? { glCode: m.pendingGlCode, glName: m.pendingGlName, proposedBy: m.pendingProposedBy, proposedAt: m.pendingProposedAt.toISOString() }
            : null,
          approvedAt: m?.approvedAt?.toISOString() ?? null,
        };
      }),
      unmapped: keys.filter((k) => !byKey.get(k.key)?.glCode).length,
    };
  }

  async proposeMapping(internalKey: string, glCode: string, glName: string, admin: AccountingAdmin) {
    requireFinance(admin);
    const code = (glCode ?? '').trim();
    const name = (glName ?? '').trim();
    if (!/^[A-Za-z0-9.\-/ ]{1,40}$/.test(code)) throw new BadRequestException('GL code: 1 to 40 letters, digits, dots, dashes or slashes');
    if (name.length < 2 || name.length > 120) throw new BadRequestException('GL account name: 2 to 120 characters');
    await this.requireKnownKey(internalKey);

    const existing = await this.prisma.glAccountMapping.findUnique({ where: { internalKey } });
    if (existing?.pendingProposedAt) throw new ConflictException('A change to this mapping is already awaiting approval');

    await this.prisma.glAccountMapping.upsert({
      where: { internalKey },
      create: { internalKey, pendingGlCode: code, pendingGlName: name, pendingProposedBy: admin.sub, pendingProposedAt: new Date() },
      update: { pendingGlCode: code, pendingGlName: name, pendingProposedBy: admin.sub, pendingProposedAt: new Date() },
    });
    await this.writeAudit(AuditSeverity.WARNING, admin.sub, 'GL_MAPPING_PROPOSED', internalKey, {
      before: existing ? { glCode: existing.glCode, glName: existing.glName } : null,
      after: { glCode: code, glName: name },
    });
    return this.listMappings();
  }

  async approveMapping(internalKey: string, admin: AccountingAdmin) {
    if (admin.tier !== AdminTier.SUPER) throw new ForbiddenException('Only a senior admin can approve a mapping');
    const m = await this.prisma.glAccountMapping.findUnique({ where: { internalKey } });
    if (!m?.pendingProposedAt) throw new ConflictException('Nothing is awaiting approval for this account');
    if (m.pendingProposedBy === admin.sub) {
      throw new ConflictException('A mapping must be approved by a different admin than the one who proposed it');
    }
    const changed = await this.prisma.glAccountMapping.updateMany({
      where: { internalKey, pendingProposedAt: m.pendingProposedAt },
      data: {
        glCode: m.pendingGlCode,
        glName: m.pendingGlName,
        pendingGlCode: null,
        pendingGlName: null,
        pendingProposedBy: null,
        pendingProposedAt: null,
        approvedBy: admin.sub,
        approvedAt: new Date(),
      },
    });
    if (changed.count !== 1) throw new ConflictException('This change was decided a moment ago');
    await this.writeAudit(AuditSeverity.WARNING, admin.sub, 'GL_MAPPING_APPROVED', internalKey, {
      glCode: m.pendingGlCode,
      glName: m.pendingGlName,
      proposedBy: m.pendingProposedBy,
    });
    return this.listMappings();
  }

  async rejectMapping(internalKey: string, admin: AccountingAdmin) {
    if (admin.tier !== AdminTier.SUPER) throw new ForbiddenException('Only a senior admin can decide on a mapping');
    const changed = await this.prisma.glAccountMapping.updateMany({
      where: { internalKey, pendingProposedAt: { not: null } },
      data: { pendingGlCode: null, pendingGlName: null, pendingProposedBy: null, pendingProposedAt: null },
    });
    if (changed.count !== 1) throw new ConflictException('Nothing is awaiting approval for this account');
    await this.writeAudit(AuditSeverity.INFO, admin.sub, 'GL_MAPPING_REJECTED', internalKey, {});
    return this.listMappings();
  }

  // ─── exports ──────────────────────────────────────────────

  // Every posting line in the month, with its general-ledger code and the
  // product it came from: the detail an accountant imports or audits.
  async journalLines(period: string) {
    requirePeriod(period);
    const { start, end } = monthRange(period);
    const rows = await this.prisma.$queryRaw<
      {
        occurred_at: Date;
        ledger_txn_id: string;
        kind: string;
        reference_type: string;
        reference_id: string;
        description: string | null;
        line_no: number;
        side: string;
        amount_ngn: number;
        memo: string | null;
        key: string;
        purpose: string;
        account_name: string;
        product_code: string | null;
      }[]
    >`SELECT t.occurred_at, t.ledger_txn_id, t.kind::text AS kind, t.reference_type, t.reference_id, t.description,
             e.line_no, e.side::text AS side, e.amount_ngn, e.memo,
             CASE WHEN a.owner_type = 'SYSTEM' THEN a.code ELSE a.purpose::text END AS key,
             a.purpose::text AS purpose,
             a.name AS account_name,
             p.code AS product_code
      FROM ledger_entries e
      JOIN ledger_transactions t ON t.ledger_txn_id = e.ledger_txn_id
      JOIN ledger_accounts a ON a.account_id = e.account_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          (SELECT d.product_id FROM tickets tk JOIN draws d ON d.draw_id = tk.draw_id
            WHERE t.reference_type = 'PaymentTransaction' AND tk.payment_txn_id = t.reference_id LIMIT 1),
          (SELECT d.product_id FROM wallet_purchases w JOIN draws d ON d.draw_id = w.draw_id
            WHERE t.reference_type = 'WalletPurchase' AND w.purchase_id = t.reference_id),
          (SELECT d.product_id FROM prize_claims c JOIN draw_results r ON r.result_id = c.draw_result_id JOIN draws d ON d.draw_id = r.draw_id
            WHERE t.reference_type = 'PrizeClaim' AND c.claim_id = t.reference_id)
        ) AS product_id
      ) src ON TRUE
      LEFT JOIN products p ON p.product_id = src.product_id
      WHERE t.occurred_at >= ${start} AND t.occurred_at < ${end}
      ORDER BY t.occurred_at, t.ledger_txn_id, e.line_no`;

    const mappings = await this.mappingsByKey(this.prisma);
    return rows.map((r) => ({
      date: watDate(r.occurred_at),
      occurredAt: r.occurred_at.toISOString(),
      ledgerTxnId: r.ledger_txn_id,
      kind: r.kind,
      reference: `${r.reference_type}:${r.reference_id}`,
      account: r.key,
      purpose: r.purpose,
      accountName: r.account_name,
      glCode: mappings.get(r.key)?.glCode ?? UNMAPPED,
      glName: mappings.get(r.key)?.glName ?? r.account_name,
      debitNgn: r.side === 'DEBIT' ? Number(r.amount_ngn) : 0,
      creditNgn: r.side === 'CREDIT' ? Number(r.amount_ngn) : 0,
      product: r.product_code ?? '',
      memo: r.memo ?? r.description ?? '',
    }));
  }

  // One line per day, general-ledger code and product: what most packages
  // import as a daily summary journal. Debits and credits balance per day.
  async journalSummary(period: string) {
    const lines = await this.journalLines(period);
    const grouped = new Map<string, { date: string; glCode: string; glName: string; product: string; debitNgn: number; creditNgn: number }>();
    for (const l of lines) {
      const key = `${l.date}|${l.glCode}|${l.product}`;
      const g = grouped.get(key) ?? { date: l.date, glCode: l.glCode, glName: l.glName, product: l.product, debitNgn: 0, creditNgn: 0 };
      g.debitNgn += l.debitNgn;
      g.creditNgn += l.creditNgn;
      grouped.set(key, g);
    }
    return [...grouped.values()]
      .map((g) => {
        // Net each line to one side, as journals are usually entered.
        const net = g.debitNgn - g.creditNgn;
        return { ...g, debitNgn: Math.max(net, 0), creditNgn: Math.max(-net, 0) };
      })
      .filter((g) => g.debitNgn !== 0 || g.creditNgn !== 0)
      .sort((a, b) => a.date.localeCompare(b.date) || a.glCode.localeCompare(b.glCode) || a.product.localeCompare(b.product));
  }

  async journalCsv(period: string, detail: boolean): Promise<string> {
    if (detail) {
      const lines = await this.journalLines(period);
      return toCsv(
        ['Date', 'Journal', 'Line', 'Kind', 'Reference', 'GL code', 'GL account', 'SureWina account', 'Debit', 'Credit', 'Product', 'Memo'],
        lines.map((l, i) => [l.date, l.ledgerTxnId, String(i + 1), l.kind, l.reference, l.glCode, l.glName, l.account, String(l.debitNgn), String(l.creditNgn), l.product, l.memo]),
      );
    }
    const rows = await this.journalSummary(period);
    return toCsv(
      ['Date', 'Journal', 'GL code', 'GL account', 'Debit', 'Credit', 'Product', 'Description'],
      rows.map((r) => [r.date, `SW-${r.date}`, r.glCode, r.glName, String(r.debitNgn), String(r.creditNgn), r.product, `SureWina daily summary ${r.date}${r.product ? ` ${r.product}` : ''}`]),
    );
  }

  // Profit and loss by product for the month, two ways:
  //  - from the ledger (what has been posted: revenue, commission, prizes,
  //    fees), and
  //  - from the draws (what the draws awarded, the company top-ups and the
  //    prizes kept), which is the accrual view the accountant may prefer.
  async productPnl(period: string) {
    requirePeriod(period);
    const { start, end } = monthRange(period);
    const lines = await this.journalLines(period);

    type Ledger = { salesRevenueNgn: number; commissionNgn: number; prizeExpenseNgn: number; feesNgn: number; otherExpenseNgn: number };
    const byProduct = new Map<string, Ledger>();
    const keyOf = (p: string) => p || 'NO PRODUCT';
    for (const l of lines) {
      const g = byProduct.get(keyOf(l.product)) ?? { salesRevenueNgn: 0, commissionNgn: 0, prizeExpenseNgn: 0, feesNgn: 0, otherExpenseNgn: 0 };
      const credit = l.creditNgn - l.debitNgn;
      const debit = l.debitNgn - l.creditNgn;
      if (l.purpose === 'TICKET_SALES_REVENUE') g.salesRevenueNgn += credit;
      else if (l.purpose === 'AGENT_COMMISSION_EXPENSE') g.commissionNgn += debit;
      else if (l.purpose === 'PRIZE_EXPENSE') g.prizeExpenseNgn += debit;
      else if (l.purpose === 'PAYMENT_PROCESSING_FEES') g.feesNgn += debit;
      else if (l.purpose === 'PROVIDER_ADJUSTMENT_EXPENSE') g.otherExpenseNgn += debit;
      else continue;
      byProduct.set(keyOf(l.product), g);
    }

    const draws = await this.prisma.$queryRaw<
      { product_code: string | null; draws: bigint; tickets: bigint | null; sales_ngn: bigint | null; awarded_ngn: bigint | null; top_up_ngn: bigint | null }[]
    >`SELECT p.code AS product_code, COUNT(DISTINCT d.draw_id) AS draws,
             SUM(r.total_tickets_sold) AS tickets,
             SUM(COALESCE(r.eligible_revenue_ngn, 0)) AS sales_ngn,
             SUM(r.prize_value_ngn) AS awarded_ngn,
             SUM(r.funding_shortfall_ngn) AS top_up_ngn
      FROM draw_results r
      JOIN draws d ON d.draw_id = r.draw_id
      LEFT JOIN products p ON p.product_id = d.product_id
      WHERE r.executed_at >= ${start} AND r.executed_at < ${end}
      GROUP BY 1`;
    const kept = await this.prisma.$queryRaw<{ product_code: string | null; kind: RetainedPrizeKind; amount: bigint | null }[]>`
      SELECT p.code AS product_code, rp.kind, SUM(rp.amount_ngn) AS amount
      FROM retained_prizes rp
      JOIN draws d ON d.draw_id = rp.draw_id
      LEFT JOIN products p ON p.product_id = d.product_id
      WHERE rp.recorded_at >= ${start} AND rp.recorded_at < ${end}
      GROUP BY 1, 2`;

    const products = new Set<string>([...byProduct.keys(), ...draws.map((d) => keyOf(d.product_code ?? '')), ...kept.map((k) => keyOf(k.product_code ?? ''))]);
    const rows = [...products].sort().map((product) => {
      const l = byProduct.get(product) ?? { salesRevenueNgn: 0, commissionNgn: 0, prizeExpenseNgn: 0, feesNgn: 0, otherExpenseNgn: 0 };
      const d = draws.find((x) => keyOf(x.product_code ?? '') === product);
      const k = kept.filter((x) => keyOf(x.product_code ?? '') === product);
      const keptBy = (kind: RetainedPrizeKind) => Number(k.find((x) => x.kind === kind)?.amount ?? 0);
      const awarded = Number(d?.awarded_ngn ?? 0);
      return {
        product,
        ledger: {
          ...l,
          // What the books show as earned after prizes, commission and fees.
          netNgn: l.salesRevenueNgn - l.commissionNgn - l.prizeExpenseNgn - l.feesNgn - l.otherExpenseNgn,
        },
        draws: {
          draws: Number(d?.draws ?? 0),
          tickets: Number(d?.tickets ?? 0),
          // Eligible revenue as the draws counted it (pool and stage draws).
          salesNgn: Number(d?.sales_ngn ?? 0),
          prizesAwardedNgn: awarded,
          companyTopUpNgn: Number(d?.top_up_ngn ?? 0),
          keptRoundingNgn: keptBy(RetainedPrizeKind.ROUNDING),
          keptUnawardedNgn: keptBy(RetainedPrizeKind.UNAWARDED),
          keptUnclaimedNgn: keptBy(RetainedPrizeKind.UNCLAIMED),
          // Gross gaming revenue: ticket sales less prizes awarded.
          ggrNgn: l.salesRevenueNgn - awarded,
        },
      };
    });

    const totalOf = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
    return {
      period,
      rows,
      totals: {
        salesRevenueNgn: totalOf((r) => r.ledger.salesRevenueNgn),
        commissionNgn: totalOf((r) => r.ledger.commissionNgn),
        prizeExpenseNgn: totalOf((r) => r.ledger.prizeExpenseNgn),
        feesNgn: totalOf((r) => r.ledger.feesNgn),
        netNgn: totalOf((r) => r.ledger.netNgn),
        prizesAwardedNgn: totalOf((r) => r.draws.prizesAwardedNgn),
        companyTopUpNgn: totalOf((r) => r.draws.companyTopUpNgn),
        keptNgn: totalOf((r) => r.draws.keptRoundingNgn + r.draws.keptUnawardedNgn + r.draws.keptUnclaimedNgn),
        ggrNgn: totalOf((r) => r.draws.ggrNgn),
      },
    };
  }

  // ─── helpers ──────────────────────────────────────────────

  private async mappingsByKey(db: Prisma.TransactionClient | PrismaService) {
    const rows = await db.glAccountMapping.findMany({ where: { glCode: { not: null } } });
    return new Map(rows.map((r) => [r.internalKey, { glCode: r.glCode as string, glName: r.glName }]));
  }

  private async requireKnownKey(internalKey: string) {
    const system = await this.prisma.ledgerAccount.findFirst({ where: { ownerType: LedgerOwnerType.SYSTEM, code: internalKey } });
    if (system) return;
    const purpose = await this.prisma.ledgerAccount.findFirst({
      where: { ownerType: { not: LedgerOwnerType.SYSTEM }, purpose: internalKey as never },
    }).catch(() => null);
    if (!purpose) throw new NotFoundException('No SureWina ledger account has that code or purpose');
  }

  private async writeAudit(severity: AuditSeverity, adminId: string, action: string, resourceId: string, metadata: Record<string, unknown>) {
    await this.audit
      .write({ severity, actor: { type: AuditActorType.ADMIN, id: adminId }, action, resource: { type: 'Accounting', id: resourceId }, metadata })
      .catch(() => undefined);
  }
}

// ─── pure helpers (exported for tests) ──────────────────────

export function requirePeriod(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period ?? '')) throw new BadRequestException('Month must look like 2026-11');
}

function requireFinance(admin: AccountingAdmin) {
  if (admin.tier !== AdminTier.SUPER && admin.role !== AdminRole.FINANCE_OFFICER) {
    throw new ForbiddenException('Only finance or a senior admin can do this');
  }
}

// The month in Nigerian time, as UTC instants: [start, end).
export function monthRange(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - WAT_OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) - WAT_OFFSET_MS),
  };
}

export function currentMonth(now = new Date()): string {
  const w = new Date(now.getTime() + WAT_OFFSET_MS);
  return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonth(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function watDate(at: Date): string {
  return new Date(at.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
}

export function hashLines(period: string, lines: TrialBalanceLine[]): string {
  const canonical = lines
    .map((l) => [l.code, l.type, l.debitNgn, l.creditNgn])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash('sha256').update(JSON.stringify({ v: 1, period, lines: canonical })).digest('hex');
}

function sumLines(lines: TrialBalanceLine[]) {
  const debitNgn = lines.reduce((s, l) => s + l.debitNgn, 0);
  const creditNgn = lines.reduce((s, l) => s + l.creditNgn, 0);
  return { debitNgn, creditNgn, balanced: debitNgn === creditNgn };
}

function titleCase(s: string): string {
  return s.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}
