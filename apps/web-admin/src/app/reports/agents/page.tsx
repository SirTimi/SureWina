'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminAgentPerformance } from '@surewina/api-client';
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

export default function AgentPerformancePage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(iso(new Date()));
  const [report, setReport] = useState<AdminAgentPerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    api.admin
      .agentPerformance(fromDate, toDate)
      .then(setReport)
      .catch((e) => {
        setReport(null);
        setError(e instanceof Error ? e.message : 'Could not load agent performance.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [fromDate, toDate]);

  const downloadCsv = () => {
    if (!report) return;
    const csv = [
      'rank,agent_code,name,state,tier,tickets,sales_ngn,rate_percent,est_commission_ngn',
      ...report.agents.map(
        (a, i) =>
          `${i + 1},${a.agentCode},"${a.fullName}",${a.stateCode ?? ''},${a.tier ?? ''},${a.tickets},${a.salesNgn},${a.commissionRatePercent},${a.estCommissionNgn}`,
      ),
      `TOTAL,,,,,${report.totals.tickets},${report.totals.salesNgn},,${report.totals.estCommissionNgn}`,
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-performance-${report.fromDate}-to-${report.toDate}.csv`;
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
        eyebrow="Reports"
        title="Agent performance"
        description="Agents ranked by sales in the period."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'Agents' },
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi
                label="Active sellers"
                value={report.totals.activeSellers.toLocaleString('en-NG')}
              />
              <Kpi label="Tickets sold" value={report.totals.tickets.toLocaleString('en-NG')} />
              <Kpi label="Gross sales" value={formatNaira(report.totals.salesNgn)} />
              <Kpi
                label="Est. commission"
                value={formatNaira(report.totals.estCommissionNgn)}
                accent
              />
            </div>

            <SectionCard
              title="Ranking"
              description={`Agents with sales between ${report.fromDate} and ${report.toDate}.`}
              padded={false}
            >
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Agent</th>
                    <th className="px-4 py-2 text-left">State</th>
                    <th className="px-4 py-2 text-left">Tier</th>
                    <th className="px-4 py-2 text-right">Tickets</th>
                    <th className="px-4 py-2 text-right">Sales</th>
                    <th className="px-4 py-2 text-right">Rate</th>
                    <th className="px-4 py-2 text-right">Est. commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.agents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                        No agent sales in this period.
                      </td>
                    </tr>
                  ) : (
                    report.agents.map((a, i) => (
                      <tr key={a.agentId}>
                        <td className="px-4 py-2 font-display font-black text-slate-400">
                          {i + 1}
                        </td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/agents/${a.agentId}`}
                            className="font-bold text-[#0B1220] hover:text-navy-700"
                          >
                            {a.fullName}
                          </Link>
                          <p className="font-mono text-xs text-slate-500">{a.agentCode}</p>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{a.stateCode ?? '—'}</td>
                        <td className="px-4 py-2">
                          {a.tier ? (
                            <StatusPill
                              tone={
                                a.tier === 'GOLD'
                                  ? 'warning'
                                  : a.tier === 'SILVER'
                                    ? 'neutral'
                                    : 'info'
                              }
                            >
                              {a.tier}
                            </StatusPill>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {a.tickets.toLocaleString('en-NG')}
                        </td>
                        <td className="px-4 py-2 text-right font-bold tabular-nums">
                          {formatNaira(a.salesNgn)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-slate-500">
                          {a.commissionRatePercent}%
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-navy-700">
                          {formatNaira(a.estCommissionNgn)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {report.agents.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200 bg-[#F8FAF4]">
                    <tr className="font-black">
                      <td className="px-4 py-2" colSpan={4}>
                        Total
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {report.totals.tickets.toLocaleString('en-NG')}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatNaira(report.totals.salesNgn)}
                      </td>
                      <td />
                      <td className="px-4 py-2 text-right tabular-nums text-navy-700">
                        {formatNaira(report.totals.estCommissionNgn)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </SectionCard>

            <p className="text-xs text-slate-500">
              Generated {new Date(report.generatedAt).toLocaleString('en-NG')} · commission shown is
              an estimate (rate × sales); authoritative amounts come from disbursement records.
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