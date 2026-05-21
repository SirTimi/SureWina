'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  Clock,
  QrCode,
  ReceiptText,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { agentMock, type AgentSale, type SalePeriod } from '@/lib/agent-mock';

type PrizePayoutSummary = {
  count: number;
  totalPaidNgn: number;
  latestPaidAt: string | null;
};

export default function AgentDashboardPage() {
  return (
    <AgentShell>
      {(agent) => <DashboardBody agent={agent} />}
    </AgentShell>
  );
}

function DashboardBody({ agent }: { agent: import('@surewina/types').AgentMe }) {
  const [period, setPeriod] = useState<SalePeriod>('today');
  const [sales, setSales] = useState<AgentSale[]>([]);
  const [payoutSummary, setPayoutSummary] = useState<PrizePayoutSummary>({
    count: 0,
    totalPaidNgn: 0,
    latestPaidAt: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([agentMock.listSales(period), agentMock.getPrizePayoutSummary()]).then(
      ([salesData, payoutData]) => {
        if (!active) return;
        setSales(salesData);
        setPayoutSummary(payoutData);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [period]);

  const todaysSales = period === 'today' ? sales : [];
  const todaySalesNgn = todaysSales.reduce((sum, sale) => sum + sale.amountNgn, 0);
  const todayCommissionNgn = todaysSales.reduce((sum, sale) => sum + sale.commissionNgn, 0);
  const ticketRemittanceNgn = Math.max(0, todaySalesNgn - todayCommissionNgn);
  const amountDueTodayNgn = Math.max(0, ticketRemittanceNgn - payoutSummary.totalPaidNgn);
  const organizationRefundNgn = Math.max(0, payoutSummary.totalPaidNgn - ticketRemittanceNgn);

  const nextTierTarget = 400;
  const progress = Math.min(100, (agent.monthlyTicketCount / nextTierTarget) * 100);
  const salesToNextTier = Math.max(0, nextTierTarget - agent.monthlyTicketCount);

  const periodTotal = sales.reduce((sum, s) => sum + s.amountNgn, 0);
  const periodCommission = sales.reduce((sum, s) => sum + s.commissionNgn, 0);
  const periodTickets = sales.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-10 pt-5">
      <section className="rounded-3xl bg-navy-800 p-5 text-white shadow-[0_24px_70px_rgba(14,42,71,0.16)] sm:p-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-400">
              Agent dashboard
            </p>
            <h1 className="mt-2 font-display text-3xl font-black leading-tight tracking-[-0.04em] text-white sm:text-4xl">
              Welcome, {agent.fullName.split(' ')[0]}.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/75">
              Sell tickets, track commission, record prize payouts, and settle the correct net remittance before cutoff.
            </p>
          </div>

          <Link href="/sell">
            <Button variant="accent" size="lg" fullWidth className="rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400">
              Sell ticket now
              <QrCode className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={<ReceiptText className="h-5 w-5" />} label="Today sales" value={formatNaira(todaySalesNgn)} hint={`${todaysSales.length} ticket sales`} success />
        <MetricCard icon={<Banknote className="h-5 w-5" />} label="Commission" value={formatNaira(todayCommissionNgn)} hint={`${Math.round(agent.commissionRate * 100)}% current rate`} success />
        <MetricCard icon={<Trophy className="h-5 w-5" />} label="Prize payouts" value={formatNaira(payoutSummary.totalPaidNgn)} hint={`${payoutSummary.count} payout${payoutSummary.count === 1 ? '' : 's'} SureWina refunds`} accent />
        <MetricCard icon={<Clock className="h-5 w-5" />} label="Amount due today" value={formatNaira(amountDueTodayNgn)} hint={organizationRefundNgn > 0 ? `SureWina owes you ${formatNaira(organizationRefundNgn)}` : agent.remittanceOverdue ? 'Overdue' : 'After payout refund'} danger={agent.remittanceOverdue} />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card variant="default" className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Performance overview
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {period === 'today' ? 'Latest ticket sales from this account.' : `Showing aggregated sales for this ${period === 'all-time' ? 'period' : period}.`}
              </p>
            </div>
            <PeriodTabs value={period} onChange={setPeriod} />
          </div>

          {period !== 'today' && (
            <div className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-navy-50 px-4 py-3">
              <SummaryStat label="Tickets" value={String(periodTickets)} />
              <SummaryStat label="Sales" value={formatNaira(periodTotal)} />
              <SummaryStat label="Commission" value={formatNaira(periodCommission)} />
            </div>
          )}

          <div>
            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
              </div>
            ) : sales.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                No sales for this period yet. <Link href="/sell" className="font-bold text-navy-700 underline-offset-2 hover:underline">Start a sale</Link>.
              </div>
            ) : (
              sales.slice(0, 8).map((sale, index) => (
                <div key={sale.ticketRef} className={index < Math.min(sales.length, 8) - 1 ? 'flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3' : 'flex items-center justify-between gap-4 px-4 py-3'}>
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-black text-navy-950">{sale.ticketRef}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {sale.customerPhone ?? 'No customer phone'} · {formatTime(sale.soldAt)}
                    </p>
                  </div>
                  <p className="font-display text-base font-black text-navy-950">{formatNaira(sale.amountNgn)}</p>
                </div>
              ))
            )}
          </div>

          {sales.length > 8 && (
            <div className="border-t border-slate-100 p-3 text-center">
              <Link href="/commission" className="text-sm font-bold text-navy-700">See full breakdown →</Link>
            </div>
          )}
        </Card>

        <aside className="space-y-4">
          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-sm bg-amber-50 text-amber-700">
              <Banknote className="h-5 w-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">Finance breakdown</p>
            <div className="mt-4 space-y-3">
              <FinanceRow label="Ticket remittance" value={formatNaira(ticketRemittanceNgn)} />
              <FinanceRow label="Prize payout refund" value={`-${formatNaira(payoutSummary.totalPaidNgn)}`} />
              <FinanceRow label="Net due today" value={formatNaira(amountDueTodayNgn)} strong />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Prize payouts are money SureWina must refund to the agent, so they reduce the amount due today.
            </p>
          </Card>

          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">Tier progress</p>
            <p className="mt-2 font-display text-2xl font-black text-navy-950">{agent.monthlyTicketCount} / {nextTierTarget} tickets</p>
            <p className="mt-1 text-xs text-slate-500">Current tier: {agent.tier}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-navy-800" style={{ width: `${progress}%` }} /></div>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">{salesToNextTier > 0 ? `${salesToNextTier} more sales to unlock the next tier.` : 'You have reached the next tier target.'}</p>
          </Card>

          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">Fast actions</p>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <ActionLink href="/sell" label="Start 60-second sale" />
              <ActionLink href="/remittance" label="View remittance" />
              <ActionLink href="/pay-prize" label="Pay customer prize" />
              <ActionLink href="/profile" label="Agent profile & tier" />
            </div>
          </Card>
        </aside>
      </section>
    </main>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function PeriodTabs({ value, onChange }: { value: SalePeriod; onChange: (v: SalePeriod) => void }) {
  const items: { label: string; value: SalePeriod }[] = [
    { label: 'Today', value: 'today' },
    { label: 'Week', value: 'week' },
    { label: 'Month', value: 'month' },
    { label: 'All', value: 'all-time' },
  ];

  return (
    <div className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-navy-50 p-1">
      {items.map((item) => (
        <button key={item.value} type="button" onClick={() => onChange(item.value)} className={value === item.value ? 'rounded-sm bg-navy-800 px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white' : 'rounded-sm px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-500'}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-0.5 font-display text-base font-black text-navy-950">{value}</p>
    </div>
  );
}

function MetricCard({ icon, label, value, hint, danger = false, success = false, accent = false }: { icon: React.ReactNode; label: string; value: string; hint: string; danger?: boolean; success?: boolean; accent?: boolean }) {
  const iconClass = danger
    ? 'mb-3 flex h-9 w-9 items-center justify-center rounded-sm bg-red-50 text-red-600'
    : success
      ? 'mb-3 flex h-9 w-9 items-center justify-center rounded-sm bg-success-bg text-success'
      : accent
        ? 'mb-3 flex h-9 w-9 items-center justify-center rounded-sm bg-amber-50 text-amber-700'
        : 'mb-3 flex h-9 w-9 items-center justify-center rounded-sm bg-navy-50 text-navy-700';

  return (
    <Card variant="default" className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
      <div className={iconClass}>{icon}</div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 truncate font-display text-xl font-black text-navy-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}

function FinanceRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-navy-50 px-3 py-2">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={strong ? 'font-display text-base font-black text-navy-950' : 'font-display text-sm font-black text-navy-950'}>{value}</p>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-sm border border-slate-200 bg-navy-50 px-3 py-3 text-sm font-bold text-navy-950 transition hover:border-navy-200 hover:bg-amber-50">
      {label}
      <ArrowRight className="h-4 w-4 text-navy-700" />
    </Link>
  );
}
