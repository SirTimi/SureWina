'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, Printer } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminLevyReport } from '@surewina/api-client';
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

export default function StateLevyReportPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(iso(new Date()));
  const [report, setReport] = useState<AdminLevyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    api.admin
      .levyReport(fromDate, toDate)
      .then(setReport)
      .catch((e) => {
        setReport(null);
        setError(e instanceof Error ? e.message : 'Could not load levy report.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [fromDate, toDate]);

  const downloadCsv = () => {
    if (!report) return;
    const csv = [
      'state,tickets,sales_ngn,levy_rate_percent,levy_due_ngn',
      ...report.states.map(
        (s) => `${s.stateCode},${s.tickets},${s.salesNgn},${report.ratePercent},${s.levyDueNgn}`,
      ),
      `TOTAL,${report.totals.tickets},${report.totals.salesNgn},,${report.totals.levyDueNgn}`,
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `state-levy-${report.fromDate}-to-${report.toDate}.csv`;
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
        title="State Games Management Board levy"
        description="Levy on sales, computed per state of play from ticket records."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'State levy' },
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
            <span className="font-black">Provisional rate:</span> figures use a{' '}
            {report ? report.ratePercent : 2.5}% rate pending confirmation of the levy rate and
            remittance mechanics with the regulatory advisor. Do not remit against these numbers
            until the rate is confirmed.
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
              <Kpi label="Tickets in period" value={report.totals.tickets.toLocaleString('en-NG')} />
              <Kpi label="Sales in period" value={formatNaira(report.totals.salesNgn)} />
              <Kpi label="Total levy due" value={formatNaira(report.totals.levyDueNgn)} accent />
            </div>

            <SectionCard
              title="By state of play"
              description={`${report.states.length} state${report.states.length === 1 ? '' : 's'} with sales between ${report.fromDate} and ${report.toDate}.`}
              padded={false}
            >
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">State</th>
                    <th className="px-4 py-2 text-right">Tickets</th>
                    <th className="px-4 py-2 text-right">Sales</th>
                    <th className="px-4 py-2 text-right">Rate</th>
                    <th className="px-4 py-2 text-right">Levy due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.states.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        No ticket sales in this period.
                      </td>
                    </tr>
                  ) : (
                    report.states.map((s) => (
                      <tr key={s.stateCode}>
                        <td className="px-4 py-2 font-mono text-xs font-black">{s.stateCode}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {s.tickets.toLocaleString('en-NG')}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNaira(s.salesNgn)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-slate-500">
                          {report.ratePercent}%
                        </td>
                        <td className="px-4 py-2 text-right font-bold tabular-nums text-navy-700">
                          {formatNaira(s.levyDueNgn)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {report.states.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200 bg-[#F8FAF4]">
                    <tr className="font-black">
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {report.totals.tickets.toLocaleString('en-NG')}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatNaira(report.totals.salesNgn)}
                      </td>
                      <td />
                      <td className="px-4 py-2 text-right tabular-nums text-navy-700">
                        {formatNaira(report.totals.levyDueNgn)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </SectionCard>

            <p className="text-xs text-slate-500">
              Generated {new Date(report.generatedAt).toLocaleString('en-NG')} · levy computed on
              ticket face value by state of play.
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