'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    agentMock.listSales(period).then((data) => {
      if (!active) return;
      setSales(data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [period]);

  const todaysSales = period === 'today' ? sales : [];
  const todaySalesNgn = todaysSales.reduce((sum, sale) => sum + sale.amountNgn, 0);
  const todayCommissionNgn = todaysSales.reduce(
    (sum, sale) => sum + sale.commissionNgn,
    0,
  );

  const nextTierTarget = 400;
  const progress = Math.min(100, (agent.monthlyTicketCount / nextTierTarget) * 100);
  const salesToNextTier = Math.max(0, nextTierTarget - agent.monthlyTicketCount);

  const periodTotal = sales.reduce((sum, s) => sum + s.amountNgn, 0);
  const periodCommission = sales.reduce((sum, s) => sum + s.commissionNgn, 0);
  const periodTickets = sales.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-10 pt-5">
      <section className="rounded-3xl bg-[#4E8F01] p-5 text-white shadow-[0_24px_70px_rgba(78,143,1,0.18)] sm:p-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A8E368]">
              Agent dashboard
            </p>

            <h1 className="mt-2 font-display text-3xl font-black leading-tight tracking-[-0.04em] text-white sm:text-4xl">
              Welcome, {agent.fullName.split(' ')[0]}.
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/75">
              Sell tickets, track commission, and settle remittance before the daily
              cutoff.
            </p>
          </div>

          <Link href="/sell">
            <Button
              variant="accent"
              size="lg"
              fullWidth
              className="rounded-sm !border-transparent bg-[#A8E368] font-black text-navy-950 hover:!border-transparent hover:bg-[#B7EF79]"
            >
              Sell ticket now
              <QrCode className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={<ReceiptText className="h-5 w-5" />}
          label="Today sales"
          value={formatNaira(todaySalesNgn)}
          hint={`${todaysSales.length} ticket sales`}
        />

        <MetricCard
          icon={<Banknote className="h-5 w-5" />}
          label="Commission"
          value={formatNaira(todayCommissionNgn)}
          hint={`${Math.round(agent.commissionRate * 100)}% current rate`}
        />

        <MetricCard
          icon={<Clock className="h-5 w-5" />}
          label="Remittance owed"
          value={formatNaira(agent.remittanceOwedNgn)}
          hint={agent.remittanceOverdue ? 'Overdue' : 'Due today'}
          danger={agent.remittanceOverdue}
        />

        <MetricCard
          icon={<Trophy className="h-5 w-5" />}
          label="Tier"
          value={agent.tier}
          hint={agent.isSuperAgent ? 'Super-agent enabled' : 'Standard agent'}
        />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card
          variant="default"
          className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
                Performance overview
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {period === 'today'
                  ? 'Latest ticket sales from this account.'
                  : `Showing aggregated sales for this ${period === 'all-time' ? 'period' : period}.`}
              </p>
            </div>

            <PeriodTabs value={period} onChange={setPeriod} />
          </div>

          {period !== 'today' && (
            <div className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-[#F8FAF4] px-4 py-3">
              <SummaryStat label="Tickets" value={String(periodTickets)} />
              <SummaryStat label="Sales" value={formatNaira(periodTotal)} />
              <SummaryStat
                label="Commission"
                value={formatNaira(periodCommission)}
              />
            </div>
          )}

          <div>
            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl bg-slate-100"
                  />
                ))}
              </div>
            ) : sales.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                No sales for this period yet.{' '}
                <Link
                  href="/sell"
                  className="font-bold text-[#4E8F01] underline-offset-2 hover:underline"
                >
                  Start a sale
                </Link>
                .
              </div>
            ) : (
              sales.slice(0, 8).map((sale, index) => (
                <div
                  key={sale.ticketRef}
                  className={
                    index < Math.min(sales.length, 8) - 1
                      ? 'flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3'
                      : 'flex items-center justify-between gap-4 px-4 py-3'
                  }
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-black text-navy-950">
                      {sale.ticketRef}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {sale.customerPhone ?? 'No customer phone'} ·{' '}
                      {formatTime(sale.soldAt)}
                    </p>
                  </div>

                  <p className="font-display text-base font-black text-navy-950">
                    {formatNaira(sale.amountNgn)}
                  </p>
                </div>
              ))
            )}
          </div>

          {sales.length > 8 && (
            <div className="border-t border-slate-100 p-3 text-center">
              <Link href="/commission" className="text-sm font-bold text-[#4E8F01]">
                See full breakdown →
              </Link>
            </div>
          )}
        </Card>

        <aside className="space-y-4">
          <Card
            variant="default"
            className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
              <TrendingUp className="h-5 w-5" />
            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
              Tier progress
            </p>

            <p className="mt-2 font-display text-2xl font-black text-navy-950">
              {agent.monthlyTicketCount} / {nextTierTarget} tickets
            </p>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#4E8F01]"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              {salesToNextTier > 0
                ? `${salesToNextTier} more sales to unlock the next tier.`
                : 'You have reached the next tier target.'}
            </p>
          </Card>

          <Card
            variant="default"
            className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
              Fast actions
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <ActionLink href="/sell" label="Start 60-second sale" />
              <ActionLink href="/remittance" label="View remittance" />
              <ActionLink href="/pay-prize" label="Pay customer prize" />
              <ActionLink href="/customers" label="Customer list" />
            </div>
          </Card>
        </aside>
      </section>
    </main>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function PeriodTabs({
  value,
  onChange,
}: {
  value: SalePeriod;
  onChange: (v: SalePeriod) => void;
}) {
  const items: { label: string; value: SalePeriod }[] = [
    { label: 'Today', value: 'today' },
    { label: 'Week', value: 'week' },
    { label: 'Month', value: 'month' },
    { label: 'All', value: 'all-time' },
  ];

  return (
    <div className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-[#F8FAF4] p-1">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={
            value === item.value
              ? 'rounded-sm bg-[#4E8F01] px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white'
              : 'rounded-sm px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-500'
          }
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 font-display text-base font-black text-navy-950">{value}</p>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <Card
      variant="default"
      className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm"
    >
      <div
        className={
          danger
            ? 'mb-3 flex h-9 w-9 items-center justify-center rounded-sm bg-red-50 text-red-600'
            : 'mb-3 flex h-9 w-9 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]'
        }
      >
        {icon}
      </div>

      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-1 truncate font-display text-xl font-black text-navy-950">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-sm border border-slate-200 bg-[#F8FAF4] px-3 py-3 text-sm font-bold text-navy-950 transition hover:border-[#4E8F01]/20 hover:bg-[#A8E368]/15"
    >
      {label}
      <ArrowRight className="h-4 w-4 text-[#4E8F01]" />
    </Link>
  );
}
