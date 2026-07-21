'use client';

import { useEffect, useState } from 'react';
import { Banknote, Download, HandCoins, Info } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminPayoutList } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { api } from '@/lib/api';

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  d.setUTCDate(1);
  return iso(d);
}

export default function PayoutsPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(iso(new Date()));
  const [data, setData] = useState<AdminPayoutList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.admin
      .listPayouts({ fromDate: fromDate || undefined, toDate: toDate || undefined })
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : 'Could not load payouts.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [fromDate, toDate]);

  const downloadCsv = () => {
    if (!data) return;
    const csv = [
      'reference,ticket_ref,winner_phone,channel,status,initiated_at,gross_ngn,wht_ngn,net_ngn',
      ...data.payouts.map(
        (p) =>
          `${p.payoutReference},${p.winnerTicketRef},${p.winnerPhone},${p.channel},${p.status},${p.payoutInitiatedAt?.slice(0, 10) ?? ''},${p.grossPrizeValueNgn},${p.whtAmountNgn},${p.netPrizeValueNgn}`,
      ),
      `TOTAL,,,,,,${data.totals.grossNgn},,${data.totals.netPaidNgn}`,
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payouts-${fromDate}-to-${toDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Prize payouts"
        description="Cash prizes paid out — by bank transfer from the app, or in cash by agents."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Payouts' }]}
        rightSlot={
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={iso(new Date())}
              onChange={(e) => setToDate(e.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
            />
            <button
              type="button"
              onClick={downloadCsv}
              disabled={!data || data.payouts.length === 0}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Payouts in period" value={String(data.totals.count)} />
              <Kpi label="Gross prizes" value={formatNaira(data.totals.grossNgn)} />
              <Kpi label="Net paid to winners" value={formatNaira(data.totals.netPaidNgn)} accent />
            </div>

            <SectionCard title="Payout records" padded={false}>
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Reference</th>
                    <th className="px-4 py-2 text-left">Ticket</th>
                    <th className="px-4 py-2 text-left">Winner</th>
                    <th className="px-4 py-2 text-left">Channel</th>
                    <th className="px-4 py-2 text-left">Initiated</th>
                    <th className="px-4 py-2 text-right">Gross</th>
                    <th className="px-4 py-2 text-right">WHT</th>
                    <th className="px-4 py-2 text-right">Net paid</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.payouts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                        No payouts in this period.
                      </td>
                    </tr>
                  ) : (
                    data.payouts.map((p) => (
                      <tr key={p.claimId}>
                        <td className="max-w-[180px] truncate px-4 py-2 font-mono text-xs font-black text-navy-700" title={p.payoutReference ?? ''}>
                          {p.payoutReference}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{p.winnerTicketRef}</td>
                        <td className="px-4 py-2">
                          <p className="font-mono text-xs">{p.winnerPhone}</p>
                          {p.accountLast4 && (
                            <p className="text-[10px] text-slate-500">acct ····{p.accountLast4}</p>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {p.channel === 'AGENT_CASH' ? (
                            <StatusPill tone="info" icon={<HandCoins className="h-3 w-3" />}>
                              Agent cash
                            </StatusPill>
                          ) : (
                            <StatusPill tone="neutral" icon={<Banknote className="h-3 w-3" />}>
                              Bank transfer
                            </StatusPill>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {p.payoutInitiatedAt
                            ? new Date(p.payoutInitiatedAt).toLocaleString('en-NG', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNaira(p.grossPrizeValueNgn)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                          {p.whtAmountNgn > 0 ? formatNaira(p.whtAmountNgn) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-bold tabular-nums">
                          {formatNaira(p.netPrizeValueNgn)}
                        </td>
                        <td className="px-4 py-2">
                          <StatusPill tone={statusToTone(p.status)}>{p.status}</StatusPill>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </SectionCard>

            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
              <p className="text-xs leading-relaxed text-slate-600">
                Read-only record view. Transfers currently run in dev mode; when the production
                payment rail (Monnify) is integrated, provider status and retry actions will appear
                here without changing these records.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={
        accent
          ? 'rounded-xl border border-navy-200 bg-navy-50 p-4'
          : 'rounded-xl border border-slate-200 bg-white p-4'
      }
    >
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p
        className={
          accent
            ? 'mt-1 font-display text-xl font-black text-navy-800'
            : 'mt-1 font-display text-xl font-black text-[#0B1220]'
        }
      >
        {value}
      </p>
    </div>
  );
}