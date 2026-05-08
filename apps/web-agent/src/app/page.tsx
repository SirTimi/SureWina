'use client';

import Link from 'next/link';
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

const mockSalesToday = [
  {
    ticketRef: 'SW-04AB-9LK2',
    phone: '+234 803 *** 9018',
    amountNgn: 500,
    soldAt: '08:42',
  },
  {
    ticketRef: 'SW-7K39-X2QP',
    phone: '+234 806 *** 7712',
    amountNgn: 5000,
    soldAt: '09:18',
  },
  {
    ticketRef: 'SW-1N2N-44TR',
    phone: null,
    amountNgn: 500,
    soldAt: '10:05',
  },
];

export default function AgentDashboardPage() {
  return (
    <AgentShell>
      {(agent) => {
        const todaySalesNgn = mockSalesToday.reduce((sum, sale) => sum + sale.amountNgn, 0);
        const todayCommissionNgn = Math.round(todaySalesNgn * agent.commissionRate);
        const nextTierTarget = 400;
        const progress = Math.min(100, (agent.monthlyTicketCount / nextTierTarget) * 100);
        const salesToNextTier = Math.max(0, nextTierTarget - agent.monthlyTicketCount);

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
                hint={`${mockSalesToday.length} ticket sales`}
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
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
                      Sales today
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Latest ticket sales from this device/account.
                    </p>
                  </div>

                  <Link
                    href="/sales"
                    className="hidden text-sm font-bold text-[#4E8F01] sm:inline-flex"
                  >
                    View all
                  </Link>
                </div>

                <div>
                  {mockSalesToday.map((sale, index) => (
                    <div
                      key={sale.ticketRef}
                      className={
                        index < mockSalesToday.length - 1
                          ? 'flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3'
                          : 'flex items-center justify-between gap-4 px-4 py-3'
                      }
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-black text-navy-950">
                          {sale.ticketRef}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {sale.phone ?? 'No customer phone'} · {sale.soldAt}
                        </p>
                      </div>

                      <p className="font-display text-base font-black text-navy-950">
                        {formatNaira(sale.amountNgn)}
                      </p>
                    </div>
                  ))}
                </div>
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
                  </div>
                </Card>
              </aside>
            </section>
          </main>
        );
      }}
    </AgentShell>
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