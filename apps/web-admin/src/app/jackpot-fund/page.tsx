'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Gift, Info, Ticket, Trophy, Users } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminJackpotOverview } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { api } from '@/lib/api';

export default function JackpotPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [data, setData] = useState<AdminJackpotOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .jackpotOverview()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load jackpot overview.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Draws"
        title="Jackpot entries"
        description="The Saturday jackpot pays a fixed template prize. Entries come from direct ₦5,000 tickets and from accumulation — every 10 daily tickets earns one free entry."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Jackpot' }]}
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Kpi
                icon={Users}
                label="Accumulating customers"
                value={data.accumulation.participants.toLocaleString('en-NG')}
              />
              <Kpi
                icon={Ticket}
                label="Daily tickets counted"
                value={data.accumulation.ticketsCounted.toLocaleString('en-NG')}
              />
              <Kpi
                icon={Gift}
                label="Free entries earned"
                value={data.accumulation.totalEntriesEarned.toLocaleString('en-NG')}
                accent
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {data.upcomingDraws.length === 0 ? (
                <SectionCard title="No upcoming jackpot">
                  <p className="py-6 text-center text-sm text-slate-500">
                    The scheduler will create the next Saturday jackpot from the active template.
                  </p>
                </SectionCard>
              ) : (
                data.upcomingDraws.map((d) => (
                  <SectionCard
                    key={d.drawId}
                    title={
                      new Date(d.scheduledAt).toLocaleDateString('en-NG', {
                        weekday: 'long',
                        day: '2-digit',
                        month: 'short',
                      })
                    }
                    description={d.drawCode}
                    rightSlot={<StatusPill tone={statusToTone(d.status)}>{d.status}</StatusPill>}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <Trophy className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-display text-2xl font-black text-[#0B1220]">
                          {formatNaira(d.prizeValueNgn)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Entry {formatNaira(d.ticketPriceNgn)} direct · or earned free
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <EntryStat label="Direct" value={d.entries.direct} />
                      <EntryStat label="Earned" value={d.entries.accumulated} />
                      <EntryStat label="Total entries" value={d.entries.total} bold />
                    </div>

                    <div className="mt-3">
                      <Link
                        href={`/draws/${d.drawId}`}
                        className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline"
                      >
                        Open draw →
                      </Link>
                    </div>
                  </SectionCard>
                ))
              )}
            </div>

            <SectionCard
              title="Approaching a free entry"
              description="Customers at 7+ of the 10 daily tickets needed for their next earned entry."
              padded={false}
            >
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Progress</th>
                    <th className="px-4 py-2 text-right">Entries earned</th>
                    <th className="px-4 py-2 text-right">Last ticket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.accumulation.nearThreshold.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                        No customers close to their next entry.
                      </td>
                    </tr>
                  ) : (
                    data.accumulation.nearThreshold.map((n) => (
                      <tr key={n.buyerPhone}>
                        <td className="px-4 py-2 font-mono text-xs">{n.buyerPhone}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-amber-500"
                                style={{ width: `${(n.progress / 10) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold tabular-nums text-slate-600">
                              {n.progress}/10
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{n.entriesEarned}</td>
                        <td className="px-4 py-2 text-right text-xs text-slate-500">
                          {new Date(n.lastTicketAt).toLocaleDateString('en-NG', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </SectionCard>

            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
              <p className="text-xs leading-relaxed text-slate-600">
                There is no monetary jackpot fund: the prize is fixed by the draw template and does
                not grow with sales. If a funded/progressive jackpot is ever wanted, that is a
                product and economics change, not a reporting one.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? 'rounded-xl border border-amber-200 bg-amber-50 p-4'
          : 'rounded-xl border border-slate-200 bg-white p-4'
      }
    >
      <div
        className={
          accent
            ? 'mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 text-amber-700'
            : 'mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-navy-50 text-navy-700'
        }
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 font-display text-xl font-black text-[#0B1220]">{value}</p>
    </div>
  );
}

function EntryStat({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-[#F8FAF4] p-2">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p
        className={
          bold
            ? 'font-display text-lg font-black text-navy-800'
            : 'font-display text-lg font-black text-[#0B1220]'
        }
      >
        {value.toLocaleString('en-NG')}
      </p>
    </div>
  );
}