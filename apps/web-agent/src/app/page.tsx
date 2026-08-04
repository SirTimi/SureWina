'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Banknote, Clock, QrCode, ReceiptText, Trophy } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { api } from '@/lib/api';

type Period = 'today' | 'week' | 'month' | 'allTime';

export default function AgentDashboardPage() {
  return (
    <AgentShell>
      {(agent) => <DashboardBody agent={agent} />}
    </AgentShell>
  );
}

function DashboardBody({ agent }: { agent: import('@surewina/types').AgentMe }) {
  const [period, setPeriod] = useState<Period>('today');
  const [today, setToday] = useState({ grossSalesNgn: 0, ticketsSold: 0, saleCount: 0, commissionNgn: 0 });
  const [owedNgn, setOwedNgn] = useState(0);
  const [perf, setPerf] = useState<Record<Period, { grossSalesNgn: number; ticketsSold: number; saleCount: number }>>({
    today: { grossSalesNgn: 0, ticketsSold: 0, saleCount: 0 },
    week: { grossSalesNgn: 0, ticketsSold: 0, saleCount: 0 },
    month: { grossSalesNgn: 0, ticketsSold: 0, saleCount: 0 },
    allTime: { grossSalesNgn: 0, ticketsSold: 0, saleCount: 0 },
  });
  const [sales, setSales] = useState<{ saleReference: string; amountNgn: number; ticketCount: number; buyerPhone: string; soldAt: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.agents.dashboard(), api.agents.performance(), api.agents.sales(1, 8)])
      .then(([d, p, s]) => {
        if (!active) return;
        setToday(d.today);
        setOwedNgn(d.remittance.owedNgn);
        setPerf(p);
        setSales(s.sales);
      })
      .catch(() => { if (active) setLoading(false); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const commissionRate = Number(agent.commissionRate);
  const p = perf[period];
  const visibleSales = sales.slice(0, 4);
  const hasMoreSales = sales.length > visibleSales.length;

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-10 pt-5">
      <section className="rounded-3xl bg-navy-800 p-5 text-white shadow-[0_24px_70px_rgba(14,42,71,0.16)] sm:p-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-400">Agent dashboard</p>
            <h1 className="mt-2 font-display text-3xl font-black leading-tight tracking-[-0.04em] text-white sm:text-4xl">Welcome, {agent.fullName.split(' ')[0]}.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/75">Sell tickets, track commission, and settle your daily remittance before cutoff.</p>
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
        <MetricCard icon={<ReceiptText className="h-5 w-5" />} label="Today sales" value={formatNaira(today.grossSalesNgn)} hint={`${today.saleCount} ticket sales`} success />
        <MetricCard icon={<Banknote className="h-5 w-5" />} label="Commission" value={formatNaira(today.commissionNgn)} hint={`${Math.round(commissionRate * 100)}% — keep from cash`} success />        <MetricCard icon={<Trophy className="h-5 w-5" />} label="Tickets today" value={String(today.ticketsSold)} hint="Cash sales" accent />
        <MetricCard icon={<Clock className="h-5 w-5" />} label="Owed to Surewina" value={formatNaira(owedNgn)} hint="Sales less your commission" />      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card variant="default" className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">Performance overview</p>
              <p className="mt-1 text-sm text-slate-500">Snapshot for the selected period.</p>
            </div>
            <PeriodTabs value={period} onChange={setPeriod} />
          </div>

          <div className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-navy-50 px-4 py-3">
            <SummaryStat label="Tickets" value={String(p.ticketsSold)} />
            <SummaryStat label="Sales" value={formatNaira(p.grossSalesNgn)} />
            <SummaryStat label="Count" value={String(p.saleCount)} />
          </div>

          <div>
            {loading ? (
              <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>
            ) : sales.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">No sales yet. <Link href="/sell" className="font-bold text-navy-700 underline-offset-2 hover:underline">Start a sale</Link>.</div>
            ) : (
              visibleSales.map((sale, index) => (
                <div key={sale.saleReference} className={index < visibleSales.length - 1 ? 'flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3' : 'flex items-center justify-between gap-4 px-4 py-3'}>
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-black text-navy-950">{sale.saleReference.slice(0, 16)}…</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{sale.buyerPhone} · {sale.ticketCount} ticket{sale.ticketCount === 1 ? '' : 's'} · {sale.soldAt ? formatTime(sale.soldAt) : ''}</p>
                  </div>
                  <p className="font-display text-base font-black text-navy-950">{formatNaira(sale.amountNgn)}</p>
                </div>
              ))
            )}
          </div>

          {sales.length > 0 && (
            <div className="border-t border-slate-100 p-3 text-center">
              <Link href="/commission" className="text-sm font-bold text-navy-700">
                {hasMoreSales ? `View more records →` : 'Open full performance report →'}
              </Link>
            </div>
          )}
        </Card>

        <aside className="space-y-4">
          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">Fast actions</p>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <ActionLink href="/sell" label="Start 60-second sale" />
              <ActionLink href="/remittance" label="View remittance" />
              <ActionLink href="/pay-prize" label="Pay customer prize" />
              <ActionLink href="/profile" label="Agent profile" />
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

function PeriodTabs({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  const items: { label: string; value: Period }[] = [
    { label: 'Today', value: 'today' },
    { label: 'Week', value: 'week' },
    { label: 'Month', value: 'month' },
    { label: 'All', value: 'allTime' },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-navy-50 p-1">
      {items.map((item) => <button key={item.value} type="button" onClick={() => onChange(item.value)} className={value === item.value ? 'rounded-sm bg-navy-800 px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white' : 'rounded-sm px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-500'}>{item.label}</button>)}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return <div className="text-center"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-0.5 font-display text-base font-black text-navy-950">{value}</p></div>;
}

function MetricCard({ icon, label, value, hint, danger = false, success = false, accent = false }: { icon: React.ReactNode; label: string; value: string; hint: string; danger?: boolean; success?: boolean; accent?: boolean }) {
  const iconClass = danger ? 'mb-3 flex h-9 w-9 items-center justify-center rounded-sm bg-red-50 text-red-600' : success ? 'mb-3 flex h-9 w-9 items-center justify-center rounded-sm bg-success-bg text-success' : accent ? 'mb-3 flex h-9 w-9 items-center justify-center rounded-sm bg-amber-50 text-amber-700' : 'mb-3 flex h-9 w-9 items-center justify-center rounded-sm bg-navy-50 text-navy-700';
  return (
    <Card variant="default" className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
      <div className={iconClass}>{icon}</div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 truncate font-display text-xl font-black text-navy-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="flex items-center justify-between rounded-sm border border-slate-200 bg-navy-50 px-3 py-3 text-sm font-bold text-navy-950 transition hover:border-navy-200 hover:bg-amber-50">{label}<ArrowRight className="h-4 w-4 text-navy-700" /></Link>;
}