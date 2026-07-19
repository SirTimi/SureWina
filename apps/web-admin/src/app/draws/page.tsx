'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Ban, Hash, Plus, Ticket, Trophy } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminDrawRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import type { AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Sales closed', value: 'SALES_CLOSED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function AdminDrawsPage() {
  return (
    <AdminShell>
      {(session) => <Body session={session} />}
    </AdminShell>
  );
}

function Body({ session }: { session: AdminSession }) {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<AdminDrawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.admin
      .listDraws(status || undefined)
      .then((res) => setRows(res.draws))
      .catch((e) => {
        setRows([]);
        setError(e instanceof Error ? e.message : 'Could not load draws.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  const cancel = async (drawId: string, drawCode: string) => {
    if (!window.confirm(`Cancel ${drawCode}? Sold tickets must be refunded separately.`)) return;
    setBusyId(drawId);
    try {
      await api.admin.cancelDraw(drawId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Draws"
        title="All draws"
        description="Scheduled, live, and completed draws. The worker auto-creates dailies and the Saturday jackpot."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Draws' }]}
        rightSlot={
          <Link
            href="/draws/new"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-black text-accent-foreground shadow-sm hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" />
            New draw
          </Link>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="inline-flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              className={
                status === f.value
                  ? 'rounded-sm bg-[#0B1220] px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white'
                  : 'rounded-sm px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-500 hover:bg-slate-50'
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : rows.length === 0 ? (
          <SectionCard title="No draws">
            <p className="py-6 text-center text-sm text-slate-500">Nothing in this state.</p>
          </SectionCard>
        ) : (
          <SectionCard title="Draws" padded={false}>
            <table className="min-w-full text-sm">
              <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Draw</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-right">Prize</th>
                  <th className="px-4 py-2 text-right">Ticket</th>
                  <th className="px-4 py-2 text-right">Sold</th>
                  <th className="px-4 py-2 text-left">Runs at</th>
                  <th className="px-4 py-2 text-left">Seed</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((d) => {
                  const cancellable = d.status === 'SCHEDULED' || d.status === 'ACTIVE';
                  return (
                    <tr key={d.drawId}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-[#0B1220]">{d.prizeDescription}</p>
                        <p className="font-mono text-xs text-slate-500">{d.drawCode}</p>
                      </td>
                      <td className="px-4 py-3">
                        {d.drawType === 'SATURDAY_JACKPOT' ? (
                          <StatusPill tone="warning" icon={<Trophy className="h-3 w-3" />}>
                            Jackpot
                          </StatusPill>
                        ) : (
                          <StatusPill tone="info" icon={<Ticket className="h-3 w-3" />}>
                            Daily
                          </StatusPill>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatNaira(d.prizeValueNgn)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatNaira(d.ticketPriceNgn)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {d.ticketsSold.toLocaleString('en-NG')}
                        {d.ticketQuota ? ` / ${d.ticketQuota.toLocaleString('en-NG')}` : ''}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {new Date(d.scheduledAt).toLocaleString('en-NG', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {d.seedCommittedHash ? (
                          <span
                            title={d.seedCommittedHash}
                            className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-700"
                          >
                            <Hash className="h-3 w-3" />
                            {d.seedCommittedHash.slice(0, 10)}…
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Not committed</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone={statusToTone(d.status)}>{d.status}</StatusPill>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cancellable ? (
                          <GuardedActionButton
                            session={session}
                            action="APPROVE_DRAW_SETUP"
                            icon={<Ban className="h-4 w-4" />}
                            onClick={() => cancel(d.drawId, d.drawCode)}
                            className="rounded-md border-red-200 bg-red-50 text-red-700"
                          >
                            {busyId === d.drawId ? 'Working…' : 'Cancel'}
                          </GuardedActionButton>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SectionCard>
        )}
      </div>
    </>
  );
}