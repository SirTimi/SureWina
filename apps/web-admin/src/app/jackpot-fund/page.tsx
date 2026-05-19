'use client';

import { ArrowDownRight, ArrowUpRight, Gauge, RotateCw } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

export default function JackpotFundPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const balance = adminMock.getJackpotBalance();
  const moves = adminMock.getJackpotMovements();

  const inflow30 = moves
    .filter((m) => m.type === 'CONTRIBUTION')
    .reduce((s, m) => s + m.amountNgn, 0);
  const outflow30 = moves
    .filter((m) => m.type === 'PAYOUT')
    .reduce((s, m) => s + m.amountNgn, 0);

  const state = balance < 1_500_000 ? 'RED' : balance < 3_500_000 ? 'AMBER' : 'GREEN';
  const tone = state === 'RED' ? 'danger' : state === 'AMBER' ? 'warning' : 'success';

  // Mini bar series — last 14 days net contribution
  const days = Array.from({ length: 14 }).map((_, i) => {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - (13 - i));
    const key = dayStart.toISOString().slice(0, 10);
    const same = moves.filter((m) => m.at.slice(0, 10) === key);
    const net = same.reduce(
      (s, m) => s + (m.type === 'PAYOUT' ? -m.amountNgn : m.amountNgn),
      0,
    );
    return { day: i, net };
  });
  const maxV = Math.max(...days.map((d) => Math.abs(d.net)), 1);

  return (
    <>
      <PageHeader
        eyebrow="Jackpot fund"
        title="Live balance"
        description="Auto-contributed by 12% of daily ticket gross. Pays out the Saturday jackpot."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Jackpot fund' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile
            icon={Gauge}
            label="Current balance"
            value={formatNaira(balance)}
            tone={tone}
            hint={`Traffic light · ${state}`}
          />
          <KpiTile
            icon={ArrowUpRight}
            label="Inflow (60d)"
            value={formatNaira(inflow30)}
            tone="success"
          />
          <KpiTile
            icon={ArrowDownRight}
            label="Payouts (60d)"
            value={formatNaira(outflow30)}
            tone="warning"
          />
          <KpiTile
            icon={RotateCw}
            label="Movements"
            value={String(moves.length)}
            hint="Last 60 days"
          />
        </div>

        <SectionCard
          title="Net daily flow · last 14 days"
          description="Positive bars are inflow days. Negative bars are jackpot payout days."
        >
          <div className="flex h-32 items-center gap-1">
            {days.map((d) => {
              const h = (Math.abs(d.net) / maxV) * 100;
              const positive = d.net >= 0;
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center">
                  {positive ? (
                    <>
                      <div className="flex h-1/2 w-full flex-col justify-end">
                        <div
                          className="w-full rounded-sm bg-navy-800"
                          style={{ height: `${h}%` }}
                        />
                      </div>
                      <div className="h-1/2 w-full" />
                    </>
                  ) : (
                    <>
                      <div className="h-1/2 w-full" />
                      <div className="flex h-1/2 w-full flex-col justify-start">
                        <div
                          className="w-full rounded-sm bg-red-500"
                          style={{ height: `${h}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Recent movements" padded={false}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-left">Draw</th>
                <th className="px-4 py-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {moves.slice(0, 20).map((m) => (
                <tr key={m.movementId}>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {new Date(m.at).toLocaleDateString('en-NG', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </td>
                  <td className="px-4 py-2 text-xs font-bold">
                    {m.type === 'PAYOUT' ? (
                      <span className="text-red-700">{m.type}</span>
                    ) : (
                      <span className="text-emerald-700">{m.type}</span>
                    )}
                  </td>
                  <td
                    className={
                      'px-4 py-2 text-right font-bold tabular-nums ' +
                      (m.type === 'PAYOUT' ? 'text-red-700' : 'text-emerald-700')
                    }
                  >
                    {m.type === 'PAYOUT' ? '-' : '+'}
                    {formatNaira(m.amountNgn)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{m.drawCode ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </>
  );
}
