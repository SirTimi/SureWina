'use client';

import { useEffect, useState } from 'react';
import { Info, Printer } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminFinancialReport } from '@surewina/api-client';
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

export default function FinancialReportPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(iso(new Date()));
  const [report, setReport] = useState<AdminFinancialReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    api.admin
      .financialReport(fromDate, toDate)
      .then(setReport)
      .catch((e) => {
        setReport(null);
        setError(e instanceof Error ? e.message : 'Could not load financial report.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [fromDate, toDate]);

  const margin = report?.net.grossMarginNgn ?? 0;

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
        title="Operating P&L"
        description="Revenue against prizes, commission, and levy accrual for the period."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'Financial' },
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

      <div className="mx-auto max-w-[860px] space-y-4 px-6 py-5">
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
          <p className="text-xs leading-relaxed text-slate-600">
            Accrual-approximate operating view from ledger data. Statutory accounts are prepared by
            the accountant — this report is for running the business, not filing it.
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
            <SectionCard title="Profit & loss" padded={false}>
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <Line
                    label="Gross ticket sales"
                    sub={`${report.revenue.transactions} confirmed transaction${report.revenue.transactions === 1 ? '' : 's'}`}
                    amount={report.revenue.grossSalesNgn}
                  />
                  <Line
                    label="Prizes settled"
                    sub={`${report.costs.prizesSettled} claim${report.costs.prizesSettled === 1 ? '' : 's'} fulfilled (gross)`}
                    amount={-report.costs.prizesGrossNgn}
                  />
                  <Line
                    label="Agent commission"
                    sub={`${report.costs.commissionCount} disbursement${report.costs.commissionCount === 1 ? '' : 's'}`}
                    amount={-report.costs.commissionNgn}
                  />
                  <Line
                    label={`State levy accrued (${report.costs.levyRatePercent}%)`}
                    sub="Provisional rate — pending regulatory confirmation"
                    amount={-report.costs.levyAccruedNgn}
                  />
                  <tr className={margin >= 0 ? 'bg-emerald-50' : 'bg-red-50'}>
                    <td className="px-5 py-4">
                      <p className="font-display text-base font-black text-[#0B1220]">
                        Gross operating margin
                      </p>
                    </td>
                    <td
                      className={
                        margin >= 0
                          ? 'px-5 py-4 text-right font-display text-xl font-black tabular-nums text-emerald-700'
                          : 'px-5 py-4 text-right font-display text-xl font-black tabular-nums text-red-700'
                      }
                    >
                      {margin < 0 ? `−${formatNaira(Math.abs(margin))}` : formatNaira(margin)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </SectionCard>

            <SectionCard title="Memo items">
              <div className="flex items-center justify-between gap-3 py-1">
                <div>
                  <p className="text-sm font-bold text-[#0B1220]">WHT withheld from winners</p>
                  <p className="text-xs text-slate-500">
                    Included in prizes settled above; held for onward remittance to the tax
                    authority — a pass-through liability, not a cost.
                  </p>
                </div>
                <p className="font-display text-lg font-black tabular-nums text-[#0B1220]">
                  {formatNaira(report.memo.whtWithheldNgn)}
                </p>
              </div>
            </SectionCard>

            <p className="text-xs text-slate-500">
              Generated {new Date(report.generatedAt).toLocaleString('en-NG')}
            </p>
          </>
        )}
      </div>
    </>
  );
}

function Line({ label, sub, amount }: { label: string; sub: string; amount: number }) {
  const negative = amount < 0;
  return (
    <tr>
      <td className="px-5 py-3">
        <p className="text-sm font-bold text-[#0B1220]">{label}</p>
        <p className="text-xs text-slate-500">{sub}</p>
      </td>
      <td
        className={
          negative
            ? 'px-5 py-3 text-right font-bold tabular-nums text-red-700'
            : 'px-5 py-3 text-right font-bold tabular-nums text-[#0B1220]'
        }
      >
        {negative ? `−${formatNaira(Math.abs(amount))}` : formatNaira(amount)}
      </td>
    </tr>
  );
}