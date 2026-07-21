'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Download, FileText, Printer, ShieldCheck, XCircle } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminDailyReport } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { api } from '@/lib/api';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const [date, setDate] = useState(today());
  const [report, setReport] = useState<AdminDailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (d: string) => {
    setLoading(true);
    setError(null);
    api.admin
      .dailyReport(d)
      .then(setReport)
      .catch((e) => {
        setReport(null);
        setError(e instanceof Error ? e.message : 'Could not load report.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => load(date), [date]);

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surewina-daily-report-${report.reportDate}.json`;
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
        eyebrow="Compliance"
        title="Daily regulatory report"
        description="Per-day draw integrity, sales by channel, prize settlements, and WHT withheld."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Reports' }]}
        rightSlot={
          <div className="no-print flex items-center gap-2">
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
            />
            <button
              type="button"
              onClick={downloadJson}
              disabled={!report}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              JSON
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
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : !report ? null : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                    Surewina · NLRC daily report
                  </p>
                  <p className="mt-1 font-display text-2xl font-black text-[#0B1220]">
                    {new Date(report.reportDate).toLocaleDateString('en-NG', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Generated {new Date(report.generatedAt).toLocaleString('en-NG')}
                  </p>
                </div>
                <FileText className="h-8 w-8 text-slate-300" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Total sales" value={formatNaira(report.totalSalesNgn)} />
              <Kpi label="Draws executed" value={String(report.draws.length)} />
              <Kpi label="WHT withheld" value={formatNaira(report.totalWhtWithheldNgn)} />
              <Kpi label="Claims forfeited" value={String(report.claimsForfeited)} />
            </div>

            <SectionCard
              title="Draw integrity"
              description="Each executed draw with the artefacts the public verifier checks."
            >
              {report.draws.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No draws executed on this date.
                </p>
              ) : (
                <div className="space-y-3">
                  {report.draws.map((d) => (
                    <div key={d.drawCode} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm font-black text-[#0B1220]">{d.drawCode}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {d.drawType} · executed{' '}
                            {d.executedAt
                              ? new Date(d.executedAt).toLocaleTimeString('en-NG', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                            {d.seedCommittedAt
                              ? ` · seed committed ${new Date(d.seedCommittedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`
                              : ''}
                          </p>
                        </div>
                        {d.integrity && (
                          <span
                            className={
                              d.integrity.zeroInterventionConfirmed
                                ? 'inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700'
                                : 'inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-700'
                            }
                          >
                            {d.integrity.zeroInterventionConfirmed ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            Zero intervention
                          </span>
                        )}
                      </div>

                      {d.integrity && (
                        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                          <div className="space-y-1.5">
                            <Row label="Winner">{d.integrity.winnerTicketRef}</Row>
                            <Row label="Prize">{formatNaira(d.integrity.prizeValueNgn)}</Row>
                            <Row label="Tickets sold">
                              {d.integrity.ticketsSold.toLocaleString('en-NG')}
                            </Row>
                            <Row label="Eligible participants">
                              {d.integrity.participants.toLocaleString('en-NG')}
                            </Row>
                            <Row label="Engine">{d.integrity.engineVersion}</Row>
                          </div>
                          <div className="space-y-1.5">
                            <Mono label="Seed hash" value={d.integrity.rngSeedHash} />
                            <Mono label="Merkle root" value={d.integrity.merkleRoot} />
                            <Mono label="Engine signature" value={d.integrity.engineSignature} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Sales by channel" padded={false}>
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Channel</th>
                    <th className="px-4 py-2 text-right">Transactions</th>
                    <th className="px-4 py-2 text-right">Tickets</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.salesByChannel.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                        No confirmed sales on this date.
                      </td>
                    </tr>
                  ) : (
                    report.salesByChannel.map((s) => (
                      <tr key={s.gateway}>
                        <td className="px-4 py-2 font-bold">{s.gateway}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{s.transactions}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{s.tickets}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNaira(s.amountNgn)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {report.salesByChannel.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200 bg-[#F8FAF4]">
                    <tr>
                      <td className="px-4 py-2 font-black">Total</td>
                      <td />
                      <td />
                      <td className="px-4 py-2 text-right font-black tabular-nums">
                        {formatNaira(report.totalSalesNgn)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </SectionCard>

            <SectionCard
              title="Prizes settled"
              description={`${report.prizesSettled.length} claim${report.prizesSettled.length === 1 ? '' : 's'} fulfilled · ${formatNaira(report.totalWhtWithheldNgn)} WHT withheld`}
              padded={false}
            >
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Ticket</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-right">Gross</th>
                    <th className="px-4 py-2 text-right">WHT</th>
                    <th className="px-4 py-2 text-right">Net</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.prizesSettled.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                        No prizes settled on this date.
                      </td>
                    </tr>
                  ) : (
                    report.prizesSettled.map((c) => (
                      <tr key={c.claimId}>
                        <td className="px-4 py-2 font-mono text-xs">{c.winnerTicketRef}</td>
                        <td className="px-4 py-2">{c.claimType ?? '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNaira(c.grossPrizeValueNgn)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNaira(c.whtAmountNgn)}
                        </td>
                        <td className="px-4 py-2 text-right font-bold tabular-nums">
                          {formatNaira(c.netPrizeValueNgn)}
                        </td>
                        <td className="px-4 py-2">
                          <StatusPill tone={statusToTone(c.status)}>{c.status}</StatusPill>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </SectionCard>

            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
              <p className="text-xs leading-relaxed text-slate-600">
                Integrity artefacts in this report are the same values the public verifier checks —
                anyone can independently confirm each draw's outcome from the committed seed hash,
                revealed seed, and Merkle root.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 font-display text-xl font-black text-[#0B1220]">{value}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="text-right font-bold text-[#0B1220]">{children}</span>
    </div>
  );
}

function Mono({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-0.5 break-all font-mono text-[10px] leading-relaxed text-slate-600">{value}</p>
    </div>
  );
}