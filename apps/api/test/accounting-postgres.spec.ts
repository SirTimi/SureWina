import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AdminRole,
  AdminTier,
  LedgerAccountPurpose,
  LedgerAccountType,
  LedgerEntrySide,
  LedgerOwnerType,
  LedgerTransactionKind,
  PrismaClient,
} from '@prisma/client';

import { AccountingAdmin, AccountingService, currentMonth, hashLines, monthRange, requirePeriod } from '../src/accounting/accounting.service';
import type { AuditService } from '../src/audit/audit.service';
import type { PrismaService } from '../src/database/prisma.service';
import { LedgerService } from '../src/ledger/ledger.service';

// Phase 3 accounting, against a real PostgreSQL database: the raw SQL
// (trial balance, journal with product attribution, P&L), the month-close
// trigger and the maker-checker rules.
//
// Runs only on a dedicated surewina_ci database with an explicit opt-in, the
// same guard as the other financial database tests.

describe('accounting pure helpers', () => {
  it('reads months in Nigerian time', () => {
    const { start, end } = monthRange('2026-10');
    expect(start.toISOString()).toBe('2026-09-30T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(monthRange('2026-12').end.toISOString()).toBe('2026-12-31T23:00:00.000Z');
    // 23:30 UTC on 31 October is already November in Lagos.
    expect(currentMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11');
    expect(currentMonth(new Date('2026-10-31T22:30:00Z'))).toBe('2026-10');
  });

  it('refuses a badly formed month', () => {
    expect(() => requirePeriod('2026-13')).toThrow(BadRequestException);
    expect(() => requirePeriod('26-10')).toThrow(BadRequestException);
    expect(() => requirePeriod('2026-10')).not.toThrow();
  });

  it('fingerprints a trial balance regardless of line order', () => {
    const a = { code: 'A', name: 'A', type: LedgerAccountType.ASSET, glCode: null, glName: null, debitNgn: 5, creditNgn: 0 };
    const b = { code: 'B', name: 'B', type: LedgerAccountType.REVENUE, glCode: '4000', glName: 'Sales', debitNgn: 0, creditNgn: 5 };
    expect(hashLines('2026-10', [a, b])).toBe(hashLines('2026-10', [b, a]));
    expect(hashLines('2026-10', [a, b])).not.toBe(hashLines('2026-11', [a, b]));
    expect(hashLines('2026-10', [a, b])).not.toBe(hashLines('2026-10', [a, { ...b, creditNgn: 6 }]));
  });
});

const database = process.env.DATABASE_URL;
let dbName: string | null = null;
try {
  dbName = database ? new URL(database).pathname.replace(/^\//, '') : null;
} catch {
  dbName = null;
}
const safeDatabase = dbName === 'surewina_ci' && (process.env.CI === 'true' || process.env.SUREWINA_FINANCIAL_DB_TESTS === '1');
const describeDatabase = safeDatabase ? describe : describe.skip;

describeDatabase('Phase 3 accounting on PostgreSQL', () => {
  const PERIOD = '2026-10';
  // Created in beforeAll so a skipped run never touches the Prisma engine.
  let prisma: PrismaClient;
  let ledger: LedgerService;
  let accounting: AccountingService;

  const run = randomUUID().slice(0, 8);
  const finance: AccountingAdmin = { sub: `fin-${run}`, role: AdminRole.FINANCE_OFFICER, tier: AdminTier.INTERMEDIATE };
  const superA: AccountingAdmin = { sub: `supA-${run}`, role: AdminRole.OPERATOR, tier: AdminTier.SUPER };
  const superB: AccountingAdmin = { sub: `supB-${run}`, role: AdminRole.OPERATOR, tier: AdminTier.SUPER };
  const productCode = `T${run}`.toUpperCase();

  let bank: string;
  let revenue: string;
  let custAvailable: string;
  let purchaseId: string;
  const ourTxns: string[] = [];

  const post = (kind: LedgerTransactionKind, ref: [string, string], occurredAt: Date, debit: string, credit: string, amount: number) =>
    ledger
      .post({
        idempotencyKey: `test:accounting:${run}:${randomUUID()}`,
        kind,
        referenceType: ref[0],
        referenceId: ref[1],
        occurredAt,
        lines: [
          { accountId: debit, side: LedgerEntrySide.DEBIT, amountNgn: amount },
          { accountId: credit, side: LedgerEntrySide.CREDIT, amountNgn: amount },
        ],
      })
      .then((t) => {
        ourTxns.push(t.ledgerTxnId);
        return t;
      });

  beforeAll(async () => {
    prisma = new PrismaClient();
    const db = prisma as unknown as PrismaService;
    ledger = new LedgerService(db);
    accounting = new AccountingService(db, { write: jest.fn(async () => undefined) } as unknown as AuditService);
    await prisma.$connect();
    await prisma.accountingPeriod.deleteMany({ where: { period: { in: [PERIOD, '2026-11'] } } });

    bank = (
      await ledger.ensureAccount({ code: 'SYS:BANK:CASH', name: 'Bank cash', accountType: LedgerAccountType.ASSET, purpose: LedgerAccountPurpose.BANK_CASH, ownerType: LedgerOwnerType.SYSTEM })
    ).accountId;
    revenue = (
      await ledger.ensureAccount({ code: 'SYS:SALES:TICKET', name: 'Ticket sales revenue', accountType: LedgerAccountType.REVENUE, purpose: LedgerAccountPurpose.TICKET_SALES_REVENUE, ownerType: LedgerOwnerType.SYSTEM })
    ).accountId;

    const user = await prisma.user.create({ data: { userId: `u-${run}`, phoneNumber: `+234800${run.replace(/\D/g, '0').padEnd(7, '0').slice(0, 7)}` } });
    custAvailable = (
      await ledger.ensureAccount({ code: `CUST:${user.userId}:AVAILABLE`, name: 'Customer available', accountType: LedgerAccountType.LIABILITY, purpose: LedgerAccountPurpose.CUSTOMER_AVAILABLE, ownerType: LedgerOwnerType.CUSTOMER, ownerId: user.userId })
    ).accountId;
    const custHeld = (
      await ledger.ensureAccount({ code: `CUST:${user.userId}:HELD`, name: 'Customer held', accountType: LedgerAccountType.LIABILITY, purpose: LedgerAccountPurpose.CUSTOMER_HELD, ownerType: LedgerOwnerType.CUSTOMER, ownerId: user.userId })
    ).accountId;
    const wallet = await prisma.wallet.create({
      data: { walletId: `w-${run}`, ownerType: LedgerOwnerType.CUSTOMER, userId: user.userId, availableAccountId: custAvailable, heldAccountId: custHeld },
    });

    const product = await prisma.product.create({
      data: {
        productId: `p-${run}`,
        code: productCode,
        name: `Test ${run}`,
        ticketLabel: `TEST ${run}`,
        kind: 'DAILY_STANDARD',
        ticketPriceNgn: 100,
        prizeDescription: 'Test prize',
        prizeModel: 'POOL',
        prizeTiers: [],
        createdByAdminId: 'test',
      } as never,
    });
    const draw = await prisma.draw.create({
      data: {
        drawId: `d-${run}`,
        drawCode: `RD-TEST-${run}`,
        drawType: 'DAILY_STANDARD',
        prizeDescription: 'Test',
        prizeValueNgn: 0,
        ticketPriceNgn: 100,
        scheduledAt: new Date('2026-10-16T11:00:00Z'),
        cutoffAt: new Date('2026-10-16T10:00:00Z'),
        productId: product.productId,
      } as never,
    });
    const purchase = await prisma.walletPurchase.create({
      data: {
        purchaseId: `wp-${run}`,
        idempotencyKey: `wp-${run}`,
        walletId: wallet.walletId,
        buyerUserId: user.userId,
        buyerPhone: user.phoneNumber,
        drawId: draw.drawId,
        stateOfPlayCode: 'LA',
        ticketCount: 5,
        amountNgn: 500,
      } as never,
    });
    purchaseId = purchase.purchaseId;

    // 15 Oct: the customer funds the wallet. 16 Oct: buys 5 tickets.
    // 31 Oct 23:30 UTC: already November in Lagos, so not October's.
    await post(LedgerTransactionKind.FUNDING, ['Test', run], new Date('2026-10-15T09:00:00Z'), bank, custAvailable, 1000);
    await post(LedgerTransactionKind.PURCHASE, ['WalletPurchase', purchaseId], new Date('2026-10-16T09:00:00Z'), custAvailable, revenue, 500);
    await post(LedgerTransactionKind.FUNDING, ['Test', `${run}-nov`], new Date('2026-10-31T23:30:00Z'), bank, custAvailable, 70);
  });

  afterAll(async () => {
    await prisma.accountingPeriod.deleteMany({ where: { period: { in: [PERIOD, '2026-11'] } } });
    await prisma.glAccountMapping.deleteMany({ where: { internalKey: 'SYS:SALES:TICKET', pendingProposedBy: finance.sub } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('journal: only the month (in Nigerian time), with the product on purchase lines', async () => {
    const lines = (await accounting.journalLines(PERIOD)).filter((l) => ourTxns.includes(l.ledgerTxnId));
    expect(lines).toHaveLength(4);
    expect(lines.filter((l) => l.reference === `WalletPurchase:${purchaseId}`).every((l) => l.product === productCode)).toBe(true);
    expect(lines.filter((l) => l.kind === 'FUNDING').every((l) => l.product === '')).toBe(true);
    // Customer accounts roll up under their purpose, not one line per customer.
    expect(lines.some((l) => l.account === 'CUSTOMER_AVAILABLE')).toBe(true);
    expect(lines.every((l) => l.date.startsWith('2026-10'))).toBe(true);
  });

  it('journal summary balances and nets each line to one side', async () => {
    const rows = await accounting.journalSummary(PERIOD);
    const dr = rows.reduce((s, r) => s + r.debitNgn, 0);
    const cr = rows.reduce((s, r) => s + r.creditNgn, 0);
    expect(dr).toBe(cr);
    expect(rows.every((r) => r.debitNgn === 0 || r.creditNgn === 0)).toBe(true);
    const csv = await accounting.journalCsv(PERIOD, false);
    expect(csv.split('\n')[0]).toBe('"Date","Journal","GL code","GL account","Debit","Credit","Product","Description"');
    expect(csv).toContain(`"${productCode}"`);
  });

  it('product P&L takes ticket sales from the ledger, by product', async () => {
    const pnl = await accounting.productPnl(PERIOD);
    const row = pnl.rows.find((r) => r.product === productCode);
    expect(row?.ledger.salesRevenueNgn).toBe(500);
    expect(row?.ledger.netNgn).toBe(500);
  });

  it('chart-of-accounts mapping needs a second, senior admin', async () => {
    await prisma.glAccountMapping.deleteMany({ where: { internalKey: 'SYS:SALES:TICKET' } });
    await expect(accounting.proposeMapping('NOT:A:REAL:ACCOUNT', '4000', 'Sales', finance)).rejects.toThrow('No SureWina ledger account');
    await expect(accounting.proposeMapping('SYS:SALES:TICKET', '4000', 'Sales', { ...finance, role: AdminRole.SUPPORT_AGENT })).rejects.toThrow(ForbiddenException);

    await accounting.proposeMapping('SYS:SALES:TICKET', '4000', 'Ticket sales', finance);
    await expect(accounting.proposeMapping('SYS:SALES:TICKET', '4001', 'Other', finance)).rejects.toThrow(ConflictException);
    await expect(accounting.approveMapping('SYS:SALES:TICKET', { ...finance, tier: AdminTier.SUPER })).rejects.toThrow('different admin');

    const listed = await accounting.approveMapping('SYS:SALES:TICKET', superA);
    const m = listed.mappings.find((x) => x.internalKey === 'SYS:SALES:TICKET');
    expect(m?.glCode).toBe('4000');
    expect(m?.pending).toBeNull();

    const lines = (await accounting.journalLines(PERIOD)).filter((l) => ourTxns.includes(l.ledgerTxnId));
    expect(lines.find((l) => l.account === 'SYS:SALES:TICKET')?.glCode).toBe('4000');
    expect(lines.find((l) => l.account === 'SYS:BANK:CASH')?.glCode).toBeDefined();
  });

  it('closing a month: dual control, frozen trial balance, postings refused', async () => {
    await expect(accounting.proposeClose(currentMonth(), finance)).rejects.toThrow('only after it has ended');

    await accounting.proposeClose(PERIOD, finance);
    await expect(accounting.proposeClose(PERIOD, finance)).rejects.toThrow(ConflictException);
    await expect(accounting.approveClose(PERIOD, finance)).rejects.toThrow(ForbiddenException);

    // A SUPER admin who proposed cannot also approve.
    await accounting.rejectClose(PERIOD, 'redo', superA);
    await accounting.proposeClose(PERIOD, superA);
    await expect(accounting.approveClose(PERIOD, superA)).rejects.toThrow('different admin');

    const closed = await accounting.approveClose(PERIOD, superB);
    expect(closed.status).toBe('CLOSED');
    expect(closed.totals.balanced).toBe(true);
    expect(closed.matchesFrozen).toBe(true);
    expect(closed.snapshotHash).toBe(hashLines(PERIOD, closed.trialBalance));
    // The November-in-Lagos posting is not in October's balance.
    const rev = closed.trialBalance.find((l) => l.code === 'SYS:SALES:TICKET');
    expect(rev?.glCode).toBe('4000');

    // The service refuses to post into the closed month...
    await expect(post(LedgerTransactionKind.FUNDING, ['Test', `${run}-late`], new Date('2026-10-20T09:00:00Z'), bank, custAvailable, 10)).rejects.toThrow();
    // ...and so does the database, for anything that bypasses the service.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO ledger_transactions (ledger_txn_id, idempotency_key, kind, reference_type, reference_id, total_amount_ngn, entry_count, fingerprint, occurred_at)
         VALUES ('${randomUUID()}', 'raw-${run}', 'ADJUSTMENT', 'Test', 'raw', 1, 2, repeat('0', 64), '2026-10-20T09:00:00Z')`,
      ),
    ).rejects.toThrow(/closed/i);
    // November is still open.
    await post(LedgerTransactionKind.FUNDING, ['Test', `${run}-nov2`], new Date('2026-11-02T09:00:00Z'), bank, custAvailable, 5);
  });

  it('reopening needs a senior admin and a real reason', async () => {
    await expect(accounting.reopen(PERIOD, 'oops', superA)).rejects.toThrow(BadRequestException);
    await expect(accounting.reopen(PERIOD, 'Late bank charge to correct', finance)).rejects.toThrow(ForbiddenException);
    const reopened = await accounting.reopen(PERIOD, 'Late bank charge to correct', superA);
    expect(reopened.status).toBe('OPEN');
    await post(LedgerTransactionKind.FUNDING, ['Test', `${run}-after`], new Date('2026-10-20T09:00:00Z'), bank, custAvailable, 10);
  });
});
