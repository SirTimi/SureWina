'use client';

import { useEffect, useState } from 'react';
import { Download, Trophy, TrendingUp } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { agentMock } from '@/lib/agent-mock';

type Summary = Awaited<ReturnType<typeof agentMock.getCommissionSummary>>;

export default function CommissionPage() {
  return (
    <AgentShell>
      {() => <CommissionBody />}
    </AgentShell>
  );
}

function CommissionBody() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    agentMock.getCommissionSummary().then(setSummary);
  }, []);

  const download = (period: 'daily' | 'monthly') => {
    const csv = agentMock.buildStatementCsv(period);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surewina-commission-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!summary) {
    return (
      <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
        <div className="h-32 animate-pulse rounded-3xl bg-white" />
      </main>
    );
  }

  const tierTarget = 400;
  const progress = Math.min(
    100,
    ((tierTarget - summary.nextTierTicketsRequired) / tierTarget) * 100,
  );

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Commission"
        title="Earnings & statements"
        description="Your live commission rate, today and month-to-date totals, plus downloadable statements."
        backHref="/"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
            Today
          </p>
          <p className="mt-2 font-display text-3xl font-black text-navy-950 tabular-nums">
            {formatNaira(summary.today.commissionNgn)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            From {summary.today.ticketCount} tickets ·{' '}
            {formatNaira(summary.today.salesNgn)} sales
          </p>
        </Card>

        <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
            Month-to-date
          </p>
          <p className="mt-2 font-display text-3xl font-black text-navy-950 tabular-nums">
            {formatNaira(summary.mtd.commissionNgn)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            From {summary.mtd.ticketCount} tickets ·{' '}
            {formatNaira(summary.mtd.salesNgn)} sales
          </p>
        </Card>

        <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
            Current rate
          </p>
          <p className="mt-2 font-display text-3xl font-black text-navy-950 tabular-nums">
            {Math.round(summary.rate * 100)}%
          </p>
          <p className="mt-1 text-xs text-slate-500">Silver tier · Reviewed monthly</p>
        </Card>
      </div>

      <Card className="mt-4 rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              Tier progress
            </p>
            <p className="mt-1 font-display text-xl font-black text-navy-950">
              {summary.nextTierTicketsRequired > 0
                ? `${summary.nextTierTicketsRequired} more tickets to Gold`
                : 'Gold tier unlocked'}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-navy-800"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Gold tier earns 12% commission. Review happens on the 1st of each month.
            </p>
          </div>
        </div>
      </Card>

      <Card className="mt-4 rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              Statements
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Download a CSV statement for your records or tax filing.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              className="rounded-sm border-navy-200 bg-white text-navy-700"
              onClick={() => download('daily')}
            >
              <Download className="h-4 w-4" />
              Daily statement
            </Button>
            <Button
              variant="accent"
              className="rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400"
              onClick={() => download('monthly')}
            >
              <Download className="h-4 w-4" />
              Monthly statement
            </Button>
          </div>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              Daily breakdown
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Last 30 days of sales and commission.
            </p>
          </div>
          <TrendingUp className="h-5 w-5 text-navy-700" />
        </div>

        <div className="hidden grid-cols-4 gap-3 border-b border-slate-100 bg-[#F8FAF4] px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 sm:grid">
          <p>Date</p>
          <p className="text-right">Tickets</p>
          <p className="text-right">Sales</p>
          <p className="text-right">Commission</p>
        </div>

        <div className="max-h-[420px] overflow-auto">
          {summary.entries.map((e) => (
            <div
              key={e.date}
              className="grid grid-cols-3 gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:grid-cols-4"
            >
              <p className="text-sm font-bold text-navy-950">
                {new Date(e.date).toLocaleDateString('en-NG', {
                  day: '2-digit',
                  month: 'short',
                })}
              </p>
              <p className="hidden text-right text-sm font-bold text-slate-700 sm:block">
                {e.ticketCount}
              </p>
              <p className="text-right text-sm font-bold text-slate-700 tabular-nums">
                {formatNaira(e.salesNgn)}
              </p>
              <p className="text-right font-display text-sm font-black text-navy-700 tabular-nums">
                {formatNaira(e.commissionNgn)}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}
