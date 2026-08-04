'use client';

import { useEffect, useState } from 'react';
import { Download, TrendingUp, Wallet } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { AgentMe } from '@surewina/types';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { api } from '@/lib/api';

interface CommissionPeriod {
  periodDate: string;
  grossSalesNgn: number;
  commissionNgn: number;
  amountDueNgn: number;
  remittanceStatus: string;
}
interface PeriodAgg {
  grossSalesNgn: number;
  ticketsSold: number;
  saleCount: number;
}

export default function CommissionPage() {
  return (
    <AgentShell>
      {(agent) => <CommissionBody agent={agent} />}
    </AgentShell>
  );
}

function CommissionBody({ agent }: { agent: AgentMe }) {
  const [totalEarnedNgn, setTotalEarnedNgn] = useState(0);
  const [periods, setPeriods] = useState<CommissionPeriod[]>([]);
  const [perf, setPerf] = useState<{ today: PeriodAgg; month: PeriodAgg } | null>(null);
  const [loading, setLoading] = useState(true);

  const rate = Number(agent.commissionRate);

  useEffect(() => {
    Promise.all([api.agents.commissionSummary(), api.agents.performance()])
      .then(([c, p]) => {
        setTotalEarnedNgn(c.totalEarnedNgn);
        setPeriods(c.periods);
        setPerf({ today: p.today, month: p.month });
      })
      .catch(() => {
        setPeriods([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const download = () => {
    const header = 'Period,Sales (NGN),Commission (NGN),Remitted (NGN),Status';
    const rows = periods.map(
      (p) =>
        `${p.periodDate},${p.grossSalesNgn},${p.commissionNgn},${p.amountDueNgn},${p.remittanceStatus}`,
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surewina-commission-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading || !perf) {
    return (
      <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
        <div className="h-32 animate-pulse rounded-3xl bg-white" />
      </main>
    );
  }

  // Live estimate from sales × rate for the current day and month. The
  // settled figure per closed day is in the table below.
  const todayEarned = Math.floor(perf.today.grossSalesNgn * rate);
  const monthEarned = Math.floor(perf.month.grossSalesNgn * rate);

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Commission"
        title="Your earnings"
        description="Commission you keep from each sale, and what you remit to Surewina."
        backHref="/"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
            Earned today
          </p>
          <p className="mt-2 font-display text-3xl font-black text-navy-950 tabular-nums">
            {formatNaira(todayEarned)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            From {perf.today.ticketsSold} tickets · {formatNaira(perf.today.grossSalesNgn)} sales
          </p>
        </Card>

        <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
            Earned this month
          </p>
          <p className="mt-2 font-display text-3xl font-black text-navy-950 tabular-nums">
            {formatNaira(monthEarned)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            From {perf.month.ticketsSold} tickets · {formatNaira(perf.month.grossSalesNgn)} sales
          </p>
        </Card>

        <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
            Current rate
          </p>
          <p className="mt-2 font-display text-3xl font-black text-navy-950 tabular-nums">
            {Math.round(rate * 100)}%
          </p>
          <p className="mt-1 text-xs text-slate-500">{agent.tier} tier · Reviewed monthly</p>
        </Card>
      </div>

      <Card className="mt-4 rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-emerald-50 text-emerald-700">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              Total commission kept
            </p>
            <p className="mt-1 font-display text-3xl font-black text-navy-950 tabular-nums">
              {formatNaira(totalEarnedNgn)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Across your last {periods.length} closed day{periods.length === 1 ? '' : 's'}. You
              keep this from the cash at the point of sale — it is already deducted from what you
              remit.
            </p>
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
              Sales, commission kept, and cash remitted for each closed day.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-navy-700" />
            {periods.length > 0 && (
              <Button
                variant="secondary"
                className="rounded-sm border-navy-200 bg-white text-navy-700"
                onClick={download}
              >
                <Download className="h-4 w-4" />
                CSV
              </Button>
            )}
          </div>
        </div>

        <div className="hidden grid-cols-5 gap-3 border-b border-slate-100 bg-[#F8FAF4] px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 sm:grid">
          <p>Period</p>
          <p className="text-right">Sales</p>
          <p className="text-right">Commission</p>
          <p className="text-right">Remitted</p>
          <p className="text-right">Status</p>
        </div>

        <div className="max-h-[420px] overflow-auto">
          {periods.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              No closed days yet. Each day&apos;s figures appear here once ticket sales close.
            </div>
          ) : (
            periods.map((p, i) => (
              <div
                key={`${p.periodDate}-${i}`}
                className="grid grid-cols-3 gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:grid-cols-5"
              >
                <p className="text-sm font-bold text-navy-950">
                  {new Date(p.periodDate).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}
                </p>
                <p className="hidden text-right font-display text-sm font-black text-navy-950 tabular-nums sm:block">
                  {formatNaira(p.grossSalesNgn)}
                </p>
                <p className="text-right font-display text-sm font-black text-emerald-700 tabular-nums">
                  {formatNaira(p.commissionNgn)}
                </p>
                <p className="text-right font-display text-sm font-black text-navy-700 tabular-nums">
                  {formatNaira(p.amountDueNgn)}
                </p>
                <p className="hidden text-right text-xs font-bold text-slate-500 sm:block">
                  {p.remittanceStatus}
                </p>
              </div>
            ))
          )}
        </div>
      </Card>
    </main>
  );
}