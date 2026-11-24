import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AdminRole, AdminTier } from '@prisma/client';

import { AccountingAdmin, AccountingService, hashLines } from '../src/accounting/accounting.service';
import type { AuditService } from '../src/audit/audit.service';
import type { PrismaService } from '../src/database/prisma.service';

// The month-close and chart-of-accounts rules, with an in-memory database.
// The SQL itself is covered by accounting-postgres.spec.ts.

type Row = Record<string, any>;

function fakeDb(tbRows: Row[] = []) {
  const periods = new Map<string, Row>();
  const mappings = new Map<string, Row>();
  const executed: string[] = [];
  const systemCodes = new Set(['SYS:SALES:TICKET', 'SYS:BANK:CASH']);

  const matches = (row: Row | undefined, where: Row) =>
    !!row &&
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'not' in v) return row[k] !== v.not && row[k] != null;
      if (v instanceof Date) return row[k]?.getTime?.() === v.getTime();
      return row[k] === v;
    });

  const db: any = {
    accountingPeriod: {
      findUnique: async ({ where }: any) => periods.get(where.period) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const cur = periods.get(where.period);
        periods.set(where.period, cur ? { ...cur, ...update } : { closeCount: 0, ...create });
      },
      update: async ({ where, data }: any) => {
        const cur = periods.get(where.period)!;
        const next = { ...cur, ...data };
        if (data.closeCount?.increment) next.closeCount = (cur.closeCount ?? 0) + data.closeCount.increment;
        periods.set(where.period, next);
      },
      updateMany: async ({ where, data }: any) => {
        const cur = periods.get(where.period);
        if (!matches(cur, where)) return { count: 0 };
        periods.set(where.period, { ...cur, ...data });
        return { count: 1 };
      },
    },
    glAccountMapping: {
      findUnique: async ({ where }: any) => mappings.get(where.internalKey) ?? null,
      findMany: async () => [...mappings.values()].filter((m) => m.glCode),
      upsert: async ({ where, create, update }: any) => {
        const cur = mappings.get(where.internalKey);
        mappings.set(where.internalKey, cur ? { ...cur, ...update } : { ...create });
      },
      updateMany: async ({ where, data }: any) => {
        const cur = mappings.get(where.internalKey);
        if (!matches(cur, where)) return { count: 0 };
        mappings.set(where.internalKey, { ...cur, ...data });
        return { count: 1 };
      },
    },
    ledgerAccount: {
      findFirst: async ({ where }: any) => (where.code && systemCodes.has(where.code) ? { code: where.code } : null),
      findMany: async () => [...systemCodes].map((code) => ({ code, name: code, accountType: 'REVENUE' })),
      groupBy: async () => [],
    },
    $queryRaw: async () => tbRows,
    $executeRawUnsafe: async (sql: string) => {
      executed.push(sql);
      return 0;
    },
  };
  db.$transaction = async (fn: (tx: any) => Promise<unknown>) => fn(db);
  return { db: db as PrismaService, periods, mappings, executed };
}

const finance: AccountingAdmin = { sub: 'fin-1', role: AdminRole.FINANCE_OFFICER, tier: AdminTier.INTERMEDIATE };
const support: AccountingAdmin = { sub: 'sup-1', role: AdminRole.SUPPORT_AGENT, tier: AdminTier.INTERMEDIATE };
const superA: AccountingAdmin = { sub: 'super-a', role: AdminRole.OPERATOR, tier: AdminTier.SUPER };
const superB: AccountingAdmin = { sub: 'super-b', role: AdminRole.OPERATOR, tier: AdminTier.SUPER };

const balancedRows = [
  { key: 'SYS:BANK:CASH', name: 'Bank', account_type: 'ASSET', side: 'DEBIT', amount: 1000n },
  { key: 'CUSTOMER_AVAILABLE', name: 'Customer Available (all customers)', account_type: 'LIABILITY', side: 'CREDIT', amount: 1000n },
  { key: 'CUSTOMER_AVAILABLE', name: 'Customer Available (all customers)', account_type: 'LIABILITY', side: 'DEBIT', amount: 500n },
  { key: 'SYS:SALES:TICKET', name: 'Revenue', account_type: 'REVENUE', side: 'CREDIT', amount: 500n },
];

function setup(rows = balancedRows) {
  const audit = { write: jest.fn(async () => undefined) };
  const f = fakeDb(rows);
  return { ...f, audit, svc: new AccountingService(f.db, audit as unknown as AuditService) };
}

describe('AccountingService: closing a month', () => {
  it('only finance or a senior admin can propose, and only once the month has ended', async () => {
    const { svc } = setup();
    await expect(svc.proposeClose('2026-10', support)).rejects.toThrow(ForbiddenException);
    await expect(svc.proposeClose('2999-01', finance)).rejects.toThrow('only after it has ended');
    await expect(svc.proposeClose('2026-13', finance)).rejects.toThrow(BadRequestException);
    const r = await svc.proposeClose('2026-10', finance);
    expect(r.status).toBe('CLOSE_PROPOSED');
    await expect(svc.proposeClose('2026-10', finance)).rejects.toThrow(ConflictException);
  });

  it('needs a senior admin who did not propose it, and freezes a fingerprinted trial balance', async () => {
    const { svc, periods, executed, audit } = setup();
    await expect(svc.approveClose('2026-10', superA)).rejects.toThrow('has not been proposed');
    await svc.proposeClose('2026-10', superA);
    await expect(svc.approveClose('2026-10', finance)).rejects.toThrow(ForbiddenException);
    await expect(svc.approveClose('2026-10', superA)).rejects.toThrow('different admin');

    const r = await svc.approveClose('2026-10', superB);
    expect(r.status).toBe('CLOSED');
    expect(executed[0]).toContain('LOCK TABLE "ledger_transactions" IN SHARE MODE');
    const row = periods.get('2026-10')!;
    expect(row.closedBy).toBe('super-b');
    expect(row.closeCount).toBe(1);
    expect(row.trialBalance).toHaveLength(3);
    expect(row.snapshotHash).toBe(hashLines('2026-10', row.trialBalance));
    expect(r.totals).toEqual({ debitNgn: 1500, creditNgn: 1500, balanced: true });
    expect(r.matchesFrozen).toBe(true);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNTING_PERIOD_CLOSED', severity: 'CRITICAL' }));
  });

  it('shows when the ledger no longer agrees with what was frozen', async () => {
    const t = setup();
    await t.svc.proposeClose('2026-10', superA);
    await t.svc.approveClose('2026-10', superB);
    balancedRows.push({ key: 'SYS:BANK:CASH', name: 'Bank', account_type: 'ASSET', side: 'DEBIT', amount: 1n });
    try {
      const r = await t.svc.getPeriod('2026-10');
      expect(r.matchesFrozen).toBe(false);
      // The frozen figures are what is shown.
      expect(r.totals.debitNgn).toBe(1500);
    } finally {
      balancedRows.pop();
    }
  });

  it('can be rejected, and reopening needs a senior admin and a real reason', async () => {
    const { svc, periods, audit } = setup();
    await svc.proposeClose('2026-10', finance);
    await expect(svc.rejectClose('2026-10', 'no', finance)).rejects.toThrow(ForbiddenException);
    expect((await svc.rejectClose('2026-10', 'redo', superA)).status).toBe('OPEN');
    await expect(svc.rejectClose('2026-10', 'redo', superA)).rejects.toThrow(ConflictException);

    await expect(svc.reopen('2026-10', 'Late bank charge', superA)).rejects.toThrow('not closed');
    await svc.proposeClose('2026-10', finance);
    await svc.approveClose('2026-10', superA);
    const hash = periods.get('2026-10')!.snapshotHash;
    await expect(svc.reopen('2026-10', 'oops', superA)).rejects.toThrow(BadRequestException);
    await expect(svc.reopen('2026-10', 'Late bank charge', finance)).rejects.toThrow(ForbiddenException);
    expect((await svc.reopen('2026-10', 'Late bank charge', superB)).status).toBe('OPEN');
    expect(periods.get('2026-10')!.proposedBy).toBeNull();
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCOUNTING_PERIOD_REOPENED', metadata: expect.objectContaining({ previousSnapshotHash: hash }) }),
    );
  });
});

describe('AccountingService: chart-of-accounts mapping', () => {
  it('a change waits for a different senior admin', async () => {
    const { svc, mappings } = setup();
    await expect(svc.proposeMapping('SYS:SALES:TICKET', '4000', 'Sales', support)).rejects.toThrow(ForbiddenException);
    await expect(svc.proposeMapping('NOPE', '4000', 'Sales', finance)).rejects.toThrow('No SureWina ledger account');
    await expect(svc.proposeMapping('SYS:SALES:TICKET', 'bad;code', 'Sales', finance)).rejects.toThrow(BadRequestException);
    await expect(svc.proposeMapping('SYS:SALES:TICKET', '4000', 'S', finance)).rejects.toThrow(BadRequestException);

    await svc.proposeMapping('SYS:SALES:TICKET', ' 4000 ', ' Ticket sales ', finance);
    expect(mappings.get('SYS:SALES:TICKET')).toMatchObject({ pendingGlCode: '4000', pendingGlName: 'Ticket sales' });
    expect(mappings.get('SYS:SALES:TICKET')?.glCode).toBeUndefined();
    await expect(svc.proposeMapping('SYS:SALES:TICKET', '4001', 'Other', finance)).rejects.toThrow('already awaiting');
    await expect(svc.approveMapping('SYS:SALES:TICKET', finance)).rejects.toThrow(ForbiddenException);
    await expect(svc.approveMapping('SYS:SALES:TICKET', { ...finance, tier: AdminTier.SUPER })).rejects.toThrow('different admin');

    const listed = await svc.approveMapping('SYS:SALES:TICKET', superA);
    expect(listed.mappings.find((m) => m.internalKey === 'SYS:SALES:TICKET')).toMatchObject({ glCode: '4000', glName: 'Ticket sales', pending: null });
    expect(listed.unmapped).toBe(1);
    await expect(svc.approveMapping('SYS:SALES:TICKET', superA)).rejects.toThrow('Nothing is awaiting');
  });

  it('a rejected change leaves the approved mapping in place', async () => {
    const { svc, mappings } = setup();
    await svc.proposeMapping('SYS:SALES:TICKET', '4000', 'Sales', finance);
    await svc.approveMapping('SYS:SALES:TICKET', superA);
    await svc.proposeMapping('SYS:SALES:TICKET', '4999', 'Wrong', finance);
    await svc.rejectMapping('SYS:SALES:TICKET', superB);
    expect(mappings.get('SYS:SALES:TICKET')).toMatchObject({ glCode: '4000', pendingGlCode: null });
    await expect(svc.rejectMapping('SYS:SALES:TICKET', superB)).rejects.toThrow('Nothing is awaiting');
  });
});
