'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, Banknote, CheckCircle2, Clock, Hourglass } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminRemittanceRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import type { AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

const FILTERS = [
  { label: 'Awaiting finance', value: 'AGENT_CONFIRMED' },
  { label: 'Pending agent', value: 'PENDING' },
  { label: 'Late', value: 'LATE' },
  { label: 'Received', value: 'RECEIVED' },
  { label: 'Open', value: '' },
];

export default function AdminRemittancePage() {
  return (
    <AdminShell>
      {(session) => <Body session={session} />}
    </AdminShell>
  );
}

function Body({ session }: { session: AdminSession }) {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<AdminRemittanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.admin
      .listRemittances(status || undefined)
      .then((res) => setRows(res.remittances))
      .catch((e) => {
        setRows([]);
        setError(e instanceof Error ? e.message : 'Could not load remittances.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  const markReceived = async (id: string) => {
    setBusyId(id);
    try {
      await api.admin.markRemittanceReceived(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark received.');
    } finally {
      setBusyId(null);
    }
  };

  const totalOutstanding = rows
    .filter((r) => r.status !== 'RECEIVED' && r.status !== 'WRITTEN_OFF')
    .reduce((sum, r) => sum + r.amountDueNgn, 0);

  const awaitingFinance = rows.filter((r) => r.status === 'AGENT_CONFIRMED').length;

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Agent remittances"
        description="Agents confirm their transfer; finance verifies receipt. Marking received releases their commission."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Remittances' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi icon={Banknote} label="Outstanding" value={formatNaira(totalOutstanding)} />
          <Kpi icon={Hourglass} label="Awaiting finance" value={String(awaitingFinance)} tone={awaitingFinance > 0 ? 'warn' : 'ok'} />
          <Kpi icon={BadgeCheck} label="Rows shown" value={String(rows.length)} />
        </div>

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
          <SectionCard title="Nothing here">
            <p className="py-6 text-center text-sm text-slate-500">No remittances in this state.</p>
          </SectionCard>
        ) : (
          <SectionCard title="Remittance periods" padded={false}>
            <table className="min-w-full text-sm">
              <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Agent</th>
                  <th className="px-4 py-2 text-left">Period</th>
                  <th className="px-4 py-2 text-right">Tickets</th>
                  <th className="px-4 py-2 text-right">Amount due</th>
                  <th className="px-4 py-2 text-left">Transfer ref</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.remittanceId}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#0B1220]">{r.agentName}</p>
                      <p className="font-mono text-xs text-slate-500">{r.agentCode}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{r.periodDate}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.ticketCount}</td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-display font-black tabular-nums">{formatNaira(r.amountDueNgn)}</p>
                      <p className="text-xs text-slate-500">{formatNaira(r.commissionNgn)} commission</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {r.bankTransferRef ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={toneFor(r.status)}>{labelFor(r.status)}</StatusPill>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'AGENT_CONFIRMED' ? (
                        <GuardedActionButton
                          session={session}
                          action="APPROVE_DRAW_SETUP"
                          icon={<CheckCircle2 className="h-4 w-4" />}
                          onClick={() => markReceived(r.remittanceId)}
                          className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-700"
                        >
                          {busyId === r.remittanceId ? 'Working…' : 'Mark received'}
                        </GuardedActionButton>
                      ) : r.status === 'RECEIVED' ? (
                        <span className="text-xs text-slate-400">
                          {r.receivedAt
                            ? new Date(r.receivedAt).toLocaleDateString('en-NG', {
                                day: '2-digit',
                                month: 'short',
                              })
                            : 'Settled'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Waiting on agent</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}
      </div>
    </>
  );
}

function toneFor(status: AdminRemittanceRow['status']) {
  if (status === 'RECEIVED') return 'success' as const;
  if (status === 'AGENT_CONFIRMED') return 'info' as const;
  if (status === 'LATE') return 'warning' as const;
  if (status === 'WRITTEN_OFF') return 'danger' as const;
  return 'neutral' as const;
}

function labelFor(status: AdminRemittanceRow['status']) {
  if (status === 'AGENT_CONFIRMED') return 'Awaiting finance';
  if (status === 'RECEIVED') return 'Received';
  if (status === 'WRITTEN_OFF') return 'Written off';
  return status;
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div
        className={
          tone === 'warn'
            ? 'mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-700'
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