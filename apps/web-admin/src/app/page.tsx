'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  Banknote,
  Clock,
  Gauge,
  Receipt,
  ShieldCheck,
  Ticket,
  Trophy,
  UserCog,
} from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';

export default function DashboardPage() {
  return (
    <AdminShell>
      {() => <DashboardBody />}
    </AdminShell>
  );
}

function DashboardBody() {
  const kpis = useMemo(() => adminMock.getDashboardKpis(), []);
  const todaysDraws = useMemo(() => adminMock.getTodaysDraws(), []);
  const failedPayments = useMemo(() => adminMock.getFailedPayments(), []);

  const [chain, setChain] = useState(() => adminMock.getAuditorChain());
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    const tick = () => {
      setChain(adminMock.getAuditorChain());
      const ms = new Date(kpis.nextDrawAt).getTime() - Date.now();
      const total = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      setCountdown(`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [kpis.nextDrawAt]);

  const jackpotTone =
    kpis.jackpot.state === 'RED'
      ? 'danger'
      : kpis.jackpot.state === 'AMBER'
        ? 'warning'
        : 'success';

  return (
    <>
      <PageHeader
        eyebrow="Operator dashboard"
        title="Morning view"
        description="The six numbers Tunde checks first. Everything else hangs off these."
        rightSlot={
          <Link
            href="/draws/new"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-black text-accent-foreground shadow-sm hover:bg-amber-400"
          >
            <Trophy className="h-4 w-4" />
            New draw
          </Link>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiTile
            icon={Ticket}
            label="Daily tickets sold"
            value={kpis.ticketsToday.toLocaleString('en-NG')}
            delta={{ value: '+12% vs yest.', positive: true }}
          />
          <KpiTile
            icon={Receipt}
            label="Gross revenue"
            value={formatNaira(kpis.grossTodayNgn)}
            hint="Settled + pending"
          />
          <KpiTile
            icon={UserCog}
            label="Active agents"
            value={String(kpis.activeAgents)}
            hint="ACTIVE status"
          />
          <KpiTile
            icon={ShieldCheck}
            label="Remit compliance"
            value={`${Math.round(kpis.remittanceCompliance * 100)}%`}
            tone={kpis.remittanceCompliance < 0.85 ? 'warning' : 'success'}
            hint="Rolling 30-day"
          />
          <KpiTile
            icon={Gauge}
            label="Jackpot fund"
            value={formatNaira(kpis.jackpot.balanceNgn)}
            tone={jackpotTone}
            hint={`Traffic light · ${kpis.jackpot.state}`}
          />
          <KpiTile
            icon={Clock}
            label="Next draw"
            value={countdown || '—'}
            hint={kpis.nextDrawPrize}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <SectionCard
            title="Today's draws"
            description="Open and scheduled draws for today, with live ticket counts."
            rightSlot={
              <Link
                href="/draws"
                className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline"
              >
                Open list →
              </Link>
            }
            padded={false}
          >
            <table className="min-w-full text-sm">
              <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Draw</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Sold / cap</th>
                  <th className="px-4 py-2 text-right">Cutoff</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {todaysDraws.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      No draws scheduled for today.
                    </td>
                  </tr>
                ) : (
                  todaysDraws.map((d) => {
                    const pct = Math.min(100, (d.ticketsSold / d.ticketCap) * 100);
                    return (
                      <tr key={d.drawCode}>
                        <td className="px-4 py-3">
                          <p className="font-black text-slate-950">{d.title}</p>
                          <p className="font-mono text-xs text-slate-500">{d.drawCode}</p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill tone={statusToTone(d.status)}>{d.status}</StatusPill>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-black text-slate-950">
                            {d.ticketsSold.toLocaleString('en-NG')} / {d.ticketCap.toLocaleString('en-NG')}
                          </p>
                          <div className="ml-auto mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-success"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                          {new Date(d.cutoffAt).toLocaleTimeString('en-NG', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/draws/${d.id}`}
                            className="text-xs font-black text-navy-700 hover:underline"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </SectionCard>

          <SectionCard title="Auditor chain" description="Latest seed and draw events.">
            <div className="space-y-3">
              {chain.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-slate-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-navy-700">
                      {entry.type}
                    </p>
                    <StatusPill tone={statusToTone(entry.status)}>{entry.status}</StatusPill>
                  </div>
                  <p className="mt-2 font-mono text-xs text-slate-600">{entry.hash}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(entry.createdAt).toLocaleString('en-NG')}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="Failed payments needing attention"
          description="These are not success states. They should never be styled green."
          padded={false}
        >
          <table className="min-w-full text-sm">
            <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-left">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {failedPayments.map((payment) => (
                <tr key={payment.ref}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{payment.ref}</td>
                  <td className="px-4 py-3 font-bold text-slate-950">{payment.customer}</td>
                  <td className="px-4 py-3 text-right font-black text-slate-950">
                    {formatNaira(payment.amountNgn)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{payment.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </>
  );
}
