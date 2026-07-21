'use client';

import { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminSalesReport } from '@surewina/api-client';
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

export default function SalesReportPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(iso(new Date()));
  const [report, setReport] = useState<AdminSalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    api.admin
      .salesReport(fromDate, toDate)
      .then(setReport)
      .catch((e) => {
        setReport(null);
        setError(e instanceof Error ? e.message : 'Could not load sales report.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [fromDate, toDate]);

  const downloadCsv = () => {
    if (!report) return;
    const csv = [
      'day,tickets,sales_ngn',
      ...report.byDay.map((d) => `${d.day},${d.tickets},${d.salesNgn}`),
      `TOTAL,${report.totals.tickets},${report.totals.salesNgn}`,
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${report.fromDate}-to-${report.toDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const maxDay = report ? Math.max(1, ...report.byDay.map((d) => d.salesNgn)) : 1;

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
        eyebrow="Reports"
        title="Sales review"
        description="Tickets and takings across the period, split by day, channel, and state of play."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'Sales' },
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
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : !report ? null : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Tickets sold" value={report.totals.tickets.toLocaleString('en-NG')} />
              <Kpi label="Gross sales" value={formatNaira(report.totals.salesNgn)} accent />
            </div>

            <SectionCard
              title="Daily sales"
              description={`${report.byDay.length} day${report.byDay.length === 1 ? '' : 's'} with activity.`}
              padded={false}
            >
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Day</th>
                    <th className="px-4 py-2 text-right">Tickets</th>
                    <th className="px-4 py-2 text-right">Sales</th>
                    <th className="px-4 py-2 text-left w-1/3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.byDay.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                        No sales in this period.
                      </td>
                    </tr>
                  ) : (
                    report.byDay.map((d) => (
                      <tr key={d.day}>
                        <td className="px-4 py-2 text-xs text-slate-600">{d.day}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{d.tickets}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNaira(d.salesNgn)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-navy-700"
                              style={{ width: `${(d.salesNgn / maxDay) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionCard title="By channel" padded={false}>
                <table className="min-w-full text-sm">
                  <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Gateway</th>
                      <th className="px-4 py-2 text-right">Txns</th>
                      <th className="px-4 py-2 text-right">Tickets</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.byGateway.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                          No confirmed payments.
                        </td>
                      </tr>
                    ) : (
                      report.byGateway.map((g) => (
                        <tr key={g.gateway}>
                          <td className="px-4 py-2 font-bold">{g.gateway}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{g.transactions}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{g.tickets}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatNaira(g.amountNgn)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </SectionCard>

              <SectionCard title="By state of play" padded={false}>
                <table className="min-w-full text-sm">
                  <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">State</th>
                      <th className="px-4 py-2 text-right">Tickets</th>
                      <th className="px-4 py-2 text-right">Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.byState.map((s) => (
                      <tr key={s.stateCode}>
                        <td className="px-4 py-2 font-mono text-xs font-black">{s.stateCode}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{s.tickets}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNaira(s.salesNgn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SectionCard>
            </div>

            <p className="text-xs text-slate-500">
              Generated {new Date(report.generatedAt).toLocaleString('en-NG')} · channel figures
              from confirmed payments; state and daily figures from ticket records.
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