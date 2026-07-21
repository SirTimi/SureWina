'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, Printer } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminWhtSchedule } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api';

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  d.setUTCDate(1);
  return iso(d);
}

export default function WhtSchedulePage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(iso(new Date()));
  const [report, setReport] = useState<AdminWhtSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    api.admin
      .whtSchedule(fromDate, toDate)
      .then(setReport)
      .catch((e) => {
        setReport(null);
        setError(e instanceof Error ? e.message : 'Could not load WHT schedule.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [fromDate, toDate]);

  const downloadCsv = () => {
    if (!report) return;
    const csv = [
      'deduction_ref,ticket_ref,winner_phone,deducted_at,gross_ngn,rate_percent,wht_ngn,net_ngn',
      ...report.deductions.map(
        (d) =>
          `${d.deductionRef},${d.winnerTicketRef},${d.winnerPhone},${d.deductedAt.slice(0, 10)},${d.grossPrizeNgn},${d.whtRatePercent},${d.whtAmountNgn},${d.netPrizeNgn}`,
      ),
      `TOTAL,,,,${report.totals.grossPrizeNgn},,${report.totals.whtPayableNgn},`,
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wht-schedule-${report.fromDate}-to-${report.toDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>

      <PageHeader
        eyebrow="Reports · Compliance"
        title="WHT deductions & remittance schedule"
        description="Tax withheld from prize payouts in the period, for remittance to the tax authority."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'WHT' },
        ]}
        rightSlot={
          <div className="no-print flex items-center gap-2">
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
              disabled={!report}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!report}
              className="inline-flex items-center gap-2 rounded-md bg-[#0B1220] px-3 py-2 text-sm font-black text-white disabled:bg-slate-300"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        }
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs leading-relaxed text-amber-800">
            <span className="font-black">Confirm before filing:</span> verify the WHT rate and
            remittance destination with the tax advisor — prize WHT for individuals may be due to
            the winner&apos;s state IRS rather than FIRS. Do not file against these figures until
            confirmed. Any credit note to the winner is issued by the tax authority, not Surewina.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : !report ? null : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Kpi
                label="Deductions in period"
                value={report.totals.deductions.toLocaleString('en-NG')}
              />
              <Kpi label="Gross prizes" value={formatNaira(report.totals.grossPrizeNgn)} />
              <Kpi label="WHT payable" value={formatNaira(report.totals.whtPayableNgn)} accent />
            </div>

            <SectionCard
              title="Deduction schedule"
              description={`Withheld between ${report.fromDate} and ${report.toDate}.`}
              padded={false}
            >
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Ref</th>
                    <th className="px-4 py-2 text-left">Ticket</th>
                    <th className="px-4 py-2 text-left">Winner</th>
                    <th className="px-4 py-2 text-left">Deducted</th>
                    <th className="px-4 py-2 text-right">Gross</th>
                    <th className="px-4 py-2 text-right">Rate</th>
                    <th className="px-4 py-2 text-right">WHT</th>
                    <th className="px-4 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.deductions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                        No WHT deductions in this period.
                      </td>
                    </tr>
                  ) : (
                    report.deductions.map((d) => (
                      <tr key={d.deductionRef}>
                        <td className="px-4 py-2 font-mono text-xs font-black text-navy-700">
                          {d.deductionRef}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{d.winnerTicketRef}</td>
                        <td className="px-4 py-2 font-mono text-xs">{d.winnerPhone}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {new Date(d.deductedAt).toLocaleDateString('en-NG', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNaira(d.grossPrizeNgn)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-slate-500">
                          {d.whtRatePercent}%
                        </td>
                        <td className="px-4 py-2 text-right font-bold tabular-nums text-navy-700">
                          {formatNaira(d.whtAmountNgn)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNaira(d.netPrizeNgn)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {report.deductions.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200 bg-[#F8FAF4]">
                    <tr className="font-black">
                      <td className="px-4 py-2" colSpan={4}>
                        Total
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatNaira(report.totals.grossPrizeNgn)}
                      </td>
                      <td />
                      <td className="px-4 py-2 text-right tabular-nums text-navy-700">
                        {formatNaira(report.totals.whtPayableNgn)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </SectionCard>

            <p className="text-xs text-slate-500">
              Generated {new Date(report.generatedAt).toLocaleString('en-NG')} · deduction records
              are immutable snapshots taken at fulfilment.
            </p>
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