'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Lock, LockOpen, XCircle } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminAccountingPeriod, AdminAccountingPeriodRow, AdminGlMapping, AdminProductPnl } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api';

// Finance: month close, the chart-of-accounts mapping, journal exports and
// profit by product. Built around the existing double-entry ledger.

export default function AccountingPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [periods, setPeriods] = useState<AdminAccountingPeriodRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'month' | 'mapping'>('month');
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.admin
      .accountingPeriods()
      .then((r) => {
        setPeriods(r.periods);
        setSelected((s) => s ?? r.periods.find((p) => p.ended)?.period ?? r.currentMonth);
      })
      .catch((e) => setError(message(e)));

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Accounting"
        description="Close each month (its trial balance is frozen and nothing more can be posted to it), map SureWina's ledger to your chart of accounts, and export the journal and profit by product for your accounting package."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Accounting' }]}
      />

      <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-5">
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="flex gap-2">
          {(
            [
              ['month', 'Months'],
              ['mapping', 'Chart of accounts'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={tab === key ? tabOn : tabOff}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'month' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <SectionCard title="Months">
              <ul className="space-y-1">
                {periods.map((p) => (
                  <li key={p.period}>
                    <button
                      type="button"
                      onClick={() => setSelected(p.period)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selected === p.period ? 'bg-navy-50 font-black' : 'hover:bg-slate-50'}`}
                    >
                      <span>{monthLabel(p.period)}</span>
                      <PeriodPill status={p.status} ended={p.ended} />
                    </button>
                  </li>
                ))}
              </ul>
            </SectionCard>
            {selected && <MonthPanel key={selected} period={selected} onChanged={load} />}
          </div>
        ) : (
          <MappingPanel />
        )}
      </div>
    </>
  );
}

function MonthPanel({ period, onChanged }: { period: string; onChanged: () => void }) {
  const [data, setData] = useState<AdminAccountingPeriod | null>(null);
  const [pnl, setPnl] = useState<AdminProductPnl | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    api.admin.accountingPeriod(period).then(setData).catch((e) => setError(message(e)));
    api.admin.productPnl(period).then(setPnl).catch(() => setPnl(null));
  };
  useEffect(load, [period]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setReason('');
      setNotice(done);
      load();
      onChanged();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async (view: 'summary' | 'detail') => {
    try {
      const blob = await api.admin.accountingJournal(period, view);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `surewina-journal-${period}-${view}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(message(e));
    }
  };

  if (!data) return <SectionCard title={monthLabel(period)}><div className="h-40 animate-pulse rounded-lg bg-slate-50" /></SectionCard>;
  const unmapped = data.trialBalance.filter((l) => !l.glCode).length;

  return (
    <div className="space-y-4">
      <SectionCard
        title={monthLabel(period)}
        description={
          data.status === 'CLOSED'
            ? `Closed ${data.closedAt ? new Date(data.closedAt).toLocaleString('en-NG') : ''}. Nothing more can be posted to this month.`
            : data.status === 'CLOSE_PROPOSED'
              ? 'Closing proposed. A different senior admin approves it.'
              : 'Open.'
        }
        rightSlot={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => download('summary')} className={smallButton}>
              <Download className="h-3.5 w-3.5" /> Journal (daily summary)
            </button>
            <button type="button" onClick={() => download('detail')} className={smallButton}>
              <Download className="h-3.5 w-3.5" /> Journal (every line)
            </button>
          </div>
        }
      >
        {error && <p className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
        {unmapped > 0 && (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {unmapped} account{unmapped === 1 ? '' : 's'} not yet mapped to your chart of accounts; they export as UNMAPPED. See Chart of accounts.
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {data.status === 'OPEN' && (
            <button type="button" disabled={busy} onClick={() => act(() => api.admin.proposePeriodClose(period), 'Closing proposed. A different senior admin must approve it.')} className={primaryButton}>
              <Lock className="h-3.5 w-3.5" /> Propose closing this month
            </button>
          )}
          {data.status === 'CLOSE_PROPOSED' && (
            <>
              <button type="button" disabled={busy} onClick={() => act(() => api.admin.approvePeriodClose(period), `${monthLabel(period)} closed.`)} className={approveButton}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve and close
              </button>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, to reject" className={`${input} flex-1`} />
              <button type="button" disabled={busy || reason.trim().length < 4} onClick={() => act(() => api.admin.rejectPeriodClose(period, reason.trim()), 'Closing rejected.')} className={rejectButton}>
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
            </>
          )}
          {data.status === 'CLOSED' && (
            <>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, to reopen (exceptional)" className={`${input} flex-1`} />
              <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => act(() => api.admin.reopenPeriod(period, reason.trim()), `${monthLabel(period)} reopened.`)} className={rejectButton}>
                <LockOpen className="h-3.5 w-3.5" /> Reopen
              </button>
            </>
          )}
        </div>

        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
          Trial balance at month end {data.status === 'CLOSED' ? '(frozen)' : ''}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="py-1.5 pr-3">GL code</th>
                <th className="py-1.5 pr-3">Account</th>
                <th className="py-1.5 pr-3 text-right">Debit</th>
                <th className="py-1.5 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {data.trialBalance.map((l) => (
                <tr key={l.code} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 font-mono text-xs">{l.glCode ?? <span className="text-amber-700">UNMAPPED</span>}</td>
                  <td className="py-1.5 pr-3">
                    {l.glName ?? l.name}
                    <span className="block font-mono text-[10px] text-slate-400">{l.code}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">{l.debitNgn ? formatNaira(l.debitNgn) : ''}</td>
                  <td className="py-1.5 text-right font-mono">{l.creditNgn ? formatNaira(l.creditNgn) : ''}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 font-black">
                <td />
                <td className="py-1.5 pr-3">
                  Total{' '}
                  {data.totals.balanced ? (
                    <span className="text-xs text-emerald-700">balanced</span>
                  ) : (
                    <span className="text-xs text-red-700">NOT balanced</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">{formatNaira(data.totals.debitNgn)}</td>
                <td className="py-1.5 text-right font-mono">{formatNaira(data.totals.creditNgn)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {data.snapshotHash && (
          <p className="mt-2 break-all font-mono text-[10px] text-slate-400">
            Frozen fingerprint {data.snapshotHash}
            {data.matchesFrozen === false && <span className="ml-2 font-sans font-black text-red-700">The ledger no longer matches what was frozen.</span>}
          </p>
        )}
      </SectionCard>

      {pnl && (
        <SectionCard title="Profit by product" description="From the ledger (what was posted) and from the draws (what was awarded, topped up and kept).">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="py-1.5 pr-3">Product</th>
                  <th className="py-1.5 pr-3 text-right">Sales</th>
                  <th className="py-1.5 pr-3 text-right">Commission</th>
                  <th className="py-1.5 pr-3 text-right">Prizes paid</th>
                  <th className="py-1.5 pr-3 text-right">Fees</th>
                  <th className="py-1.5 pr-3 text-right">Net (ledger)</th>
                  <th className="py-1.5 pr-3 text-right">Prizes awarded</th>
                  <th className="py-1.5 pr-3 text-right">Top-ups</th>
                  <th className="py-1.5 pr-3 text-right">Kept</th>
                  <th className="py-1.5 text-right">GGR</th>
                </tr>
              </thead>
              <tbody>
                {pnl.rows.map((r) => (
                  <tr key={r.product} className="border-t border-slate-100 font-mono">
                    <td className="py-1.5 pr-3 font-sans font-bold">{r.product}</td>
                    <td className="py-1.5 pr-3 text-right">{formatNaira(r.ledger.salesRevenueNgn)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatNaira(r.ledger.commissionNgn)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatNaira(r.ledger.prizeExpenseNgn)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatNaira(r.ledger.feesNgn)}</td>
                    <td className="py-1.5 pr-3 text-right font-bold">{formatNaira(r.ledger.netNgn)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatNaira(r.draws.prizesAwardedNgn)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatNaira(r.draws.companyTopUpNgn)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatNaira(r.draws.keptRoundingNgn + r.draws.keptUnawardedNgn + r.draws.keptUnclaimedNgn)}</td>
                    <td className="py-1.5 text-right font-bold">{formatNaira(r.draws.ggrNgn)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 font-mono font-black">
                  <td className="py-1.5 pr-3 font-sans">Total</td>
                  <td className="py-1.5 pr-3 text-right">{formatNaira(pnl.totals.salesRevenueNgn)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatNaira(pnl.totals.commissionNgn)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatNaira(pnl.totals.prizeExpenseNgn)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatNaira(pnl.totals.feesNgn)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatNaira(pnl.totals.netNgn)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatNaira(pnl.totals.prizesAwardedNgn)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatNaira(pnl.totals.companyTopUpNgn)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatNaira(pnl.totals.keptNgn)}</td>
                  <td className="py-1.5 text-right">{formatNaira(pnl.totals.ggrNgn)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Prizes paid: prize expense posted in the ledger this month (as claims are paid). Prizes awarded: what the month&apos;s draws awarded. GGR = sales less prizes awarded.
          </p>
        </SectionCard>
      )}
    </div>
  );
}

function MappingPanel() {
  const [rows, setRows] = useState<AdminGlMapping[]>([]);
  const [edit, setEdit] = useState<Record<string, { code: string; name: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.admin
      .glMappings()
      .then((r) => setRows(r.mappings))
      .catch((e) => setError(message(e)));
  useEffect(() => {
    void load();
  }, []);

  const run = async (fn: () => Promise<{ mappings: AdminGlMapping[] }>) => {
    setError(null);
    try {
      const r = await fn();
      setRows(r.mappings);
      setEdit({});
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <SectionCard
      title="Chart of accounts"
      description="Enter the accounting consultant's general-ledger code and name for each SureWina account. Exports and the trial balance use these. Every change needs a different senior admin's approval."
    >
      {error && <p className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="py-1.5 pr-3">SureWina account</th>
              <th className="py-1.5 pr-3">Type</th>
              <th className="py-1.5 pr-3">GL code</th>
              <th className="py-1.5 pr-3">GL account name</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const e = edit[m.internalKey];
              return (
                <tr key={m.internalKey} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-3">
                    {m.name}
                    <span className="block font-mono text-[10px] text-slate-400">{m.internalKey}</span>
                  </td>
                  <td className="py-2 pr-3 text-xs">{m.type}</td>
                  <td className="py-2 pr-3">
                    {e ? (
                      <input value={e.code} onChange={(ev) => setEdit({ ...edit, [m.internalKey]: { ...e, code: ev.target.value } })} className={`${input} w-28`} />
                    ) : (
                      <span className="font-mono">{m.glCode ?? <span className="text-amber-700">—</span>}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {e ? (
                      <input value={e.name} onChange={(ev) => setEdit({ ...edit, [m.internalKey]: { ...e, name: ev.target.value } })} className={`${input} w-full`} />
                    ) : (
                      m.glName ?? ''
                    )}
                    {m.pending && (
                      <span className="mt-1 block rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        Proposed: {m.pending.glCode} · {m.pending.glName}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {m.pending ? (
                      <span className="flex justify-end gap-1">
                        <button type="button" onClick={() => run(() => api.admin.approveGlMapping(m.internalKey))} className={approveButton}>Approve</button>
                        <button type="button" onClick={() => run(() => api.admin.rejectGlMapping(m.internalKey))} className={rejectButton}>Reject</button>
                      </span>
                    ) : e ? (
                      <span className="flex justify-end gap-1">
                        <button type="button" onClick={() => run(() => api.admin.proposeGlMapping(m.internalKey, e.code.trim(), e.name.trim()))} className={primaryButton}>Send for approval</button>
                        <button type="button" onClick={() => setEdit(({ [m.internalKey]: _, ...rest }) => rest)} className={smallButton}>Cancel</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setEdit({ ...edit, [m.internalKey]: { code: m.glCode ?? '', name: m.glName ?? m.name } })} className={smallButton}>
                        {m.glCode ? 'Change' : 'Map'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function PeriodPill({ status, ended }: { status: string; ended: boolean }) {
  if (status === 'CLOSED') return <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-black text-white">Closed</span>;
  if (status === 'CLOSE_PROPOSED') return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-800">To approve</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{ended ? 'Open' : 'Current'}</span>;
}

function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : 'That did not work.';
}

const tabOn = 'rounded-md bg-navy-700 px-4 py-2 text-sm font-black text-white';
const tabOff = 'rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700';
const input = 'h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700';
const smallButton = 'inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-[#0B1220] hover:border-slate-300 disabled:opacity-40';
const primaryButton = 'inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-xs font-black text-white disabled:opacity-40';
const approveButton = 'inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-40';
const rejectButton = 'inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-red-700 disabled:opacity-40';
