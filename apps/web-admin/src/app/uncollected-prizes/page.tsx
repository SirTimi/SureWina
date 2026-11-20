'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download, ReceiptText } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminRetainedPrizeKind, AdminUncollectedPrizes } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api';

const KINDS: { kind: AdminRetainedPrizeKind; label: string; help: string }[] = [
  { kind: 'ROUNDING', label: 'Rounding', help: 'Too small for one more whole winner' },
  { kind: 'UNAWARDED', label: 'Not enough entries', help: 'Prizes the pool allowed but nobody could win' },
  { kind: 'UNCLAIMED', label: 'Unclaimed', help: 'Forfeited after the claim deadline' },
];

export default function UncollectedPrizesPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [kind, setKind] = useState<AdminRetainedPrizeKind | ''>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUncollectedPrizes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.admin
      .uncollectedPrizes({
        ...(fromDate ? { fromDate } : {}),
        ...(toDate ? { toDate } : {}),
        ...(kind ? { kind } : {}),
        page,
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the ledger.'))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, kind, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Uncollected prizes"
        description="Prize money that stays with the company, with the date each amount was recorded. Written by the draw engine and the claims sweep; nobody can edit it."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Uncollected prizes' }]}
      />

      <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Total label="All" count={data?.totals.all.count} amount={data?.totals.all.amountNgn} strong />
          {KINDS.map((k) => (
            <Total key={k.kind} label={k.label} hint={k.help} count={data?.totals[k.kind].count} amount={data?.totals[k.kind].amountNgn} />
          ))}
        </div>

        <SectionCard
          title="Ledger"
          rightSlot={
            data && data.rows.length > 0 ? (
              <button
                type="button"
                onClick={() => downloadCsv(data)}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-[#0B1220] hover:border-slate-300"
              >
                <Download className="h-3.5 w-3.5" />
                This page as CSV
              </button>
            ) : undefined
          }
        >
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Filter label="From">
              <input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className={inputClass} />
            </Filter>
            <Filter label="To">
              <input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className={inputClass} />
            </Filter>
            <Filter label="Kind">
              <select value={kind} onChange={(e) => { setPage(1); setKind(e.target.value as AdminRetainedPrizeKind | ''); }} className={inputClass}>
                <option value="">All</option>
                {KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>{k.label}</option>
                ))}
              </select>
            </Filter>
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
          ) : loading && !data ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-50" />
          ) : !data || data.rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              <ReceiptText className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              Nothing recorded for these filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Recorded</th>
                    <th className="py-2 pr-3">Draw</th>
                    <th className="py-2 pr-3">Kind</th>
                    <th className="py-2 pr-3">Prize</th>
                    <th className="py-2 pr-3">Winner</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.retainedId} className="border-t border-slate-100">
                      <td className="py-2 pr-3 whitespace-nowrap">{dateTime(r.recordedAt)}</td>
                      <td className="py-2 pr-3">
                        <Link href={`/draws/${r.drawId}`} className="font-mono text-xs font-bold text-navy-700 hover:underline">
                          {r.drawCode}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{KINDS.find((k) => k.kind === r.kind)?.label ?? r.kind}</td>
                      <td className="py-2 pr-3">{r.claim?.prizeDescription ?? r.tierName ?? 'Whole pool'}</td>
                      <td className="py-2 pr-3 text-xs">
                        {r.claim ? (
                          <Link href={`/claims/${r.claim.claimId}`} className="font-mono hover:underline">
                            {r.claim.winnerTicketRef} · {r.claim.winnerPhone}
                            <span className="block text-slate-500">deadline {dateTime(r.claim.claimDeadlineAt)}</span>
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono font-bold">{formatNaira(r.amountNgn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-500">
                Page {page} of {pages} · {data.total.toLocaleString('en-NG')} entries
              </span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={pagerClass}>Previous</button>
                <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={pagerClass}>Next</button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function Total({ label, hint, count, amount, strong }: { label: string; hint?: string; count?: number; amount?: number; strong?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${strong ? 'border-navy-700 bg-navy-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-black text-[#0B1220]">{amount == null ? '—' : formatNaira(amount)}</p>
      <p className="mt-0.5 text-xs text-slate-500">
        {count == null ? '' : `${count.toLocaleString('en-NG')} entr${count === 1 ? 'y' : 'ies'}`}
        {hint ? `${count == null ? '' : ' · '}${hint}` : ''}
      </p>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700';
const pagerClass = 'rounded-md border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 disabled:opacity-40';

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function downloadCsv(data: AdminUncollectedPrizes) {
  const header = ['Recorded', 'Draw', 'Kind', 'Prize', 'Ticket', 'Claim deadline', 'Amount (NGN)'];
  const lines = data.rows.map((r) => [
    r.recordedAt,
    r.drawCode,
    r.kind,
    r.claim?.prizeDescription ?? r.tierName ?? 'Whole pool',
    r.claim?.winnerTicketRef ?? '',
    r.claim?.claimDeadlineAt ?? '',
    String(r.amountNgn),
  ]);
  const csv = [header, ...lines].map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `uncollected-prizes-page-${data.page}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
