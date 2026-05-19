'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use, useState } from 'react';
import {
  Ban,
  Coins,
  GitBranch,
  Phone,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Trophy,
  XCircle,
} from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AdminShell>
      {() => <Body id={id} />}
    </AdminShell>
  );
}

function Body({ id }: { id: string }) {
  const agent = adminMock.getAgent(id);
  if (!agent) notFound();

  const remits = adminMock.listRemittances().filter((r) => r.agentCode === agent.agentCode);
  const commission = adminMock
    .listCommissionLedger()
    .filter((c) => c.agentCode === agent.agentCode);

  const [actionOpen, setActionOpen] = useState<null | 'suspend' | 'terminate'>(null);
  const [reason, setReason] = useState('');

  // Simple 14-day spark using daily sales fluctuation
  const series = Array.from({ length: 14 }).map((_, i) => ({
    day: i,
    value: 4000 + ((i * 73 + agent.monthlyTicketCount) % 9000),
  }));
  const maxV = Math.max(...series.map((s) => s.value));

  return (
    <>
      <PageHeader
        eyebrow="Agent"
        title={agent.fullName}
        description={`${agent.agentCode} · ${agent.stateCode}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Agents', href: '/agents' },
          { label: agent.agentCode },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            <StatusPill tone={statusToTone(agent.status)}>{agent.status}</StatusPill>
            <Button
              variant="secondary"
              onClick={() => setActionOpen('suspend')}
              className="rounded-md border-amber-200 bg-amber-50 text-amber-700"
            >
              <Ban className="h-4 w-4" />
              Suspend
            </Button>
            <Button
              variant="secondary"
              onClick={() => setActionOpen('terminate')}
              className="rounded-md border-red-200 bg-red-50 text-red-700"
            >
              <XCircle className="h-4 w-4" />
              Terminate
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={Phone} label="Phone">{agent.phoneE164}</Stat>
          <Stat icon={Trophy} label="Tier">{agent.tier}</Stat>
          <Stat icon={TrendingUp} label="MTD sales">{formatNaira(agent.monthlySalesNgn)}</Stat>
          <Stat icon={Receipt} label="MTD tickets">{agent.monthlyTicketCount}</Stat>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            title="14-day performance"
            description="Daily ticket gross — quick visual signal of momentum."
          >
            <div className="flex h-32 items-end gap-1">
              {series.map((s) => (
                <div key={s.day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm bg-navy-800"
                    style={{ height: `${(s.value / maxV) * 100}%` }}
                  />
                  <p className="text-[9px] text-slate-400">{s.day + 1}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
              <SmallStat label="Avg/day" value={formatNaira(Math.round(agent.monthlySalesNgn / 30))} />
              <SmallStat label="Compliance" value={`${Math.round(agent.remittanceCompliance * 100)}%`} />
              <SmallStat
                label="Network"
                value={
                  agent.isSuperAgent
                    ? 'Super-agent'
                    : agent.superAgentCode
                      ? `Under ${agent.superAgentCode.slice(-6)}`
                      : 'Independent'
                }
              />
            </div>
          </SectionCard>

          <SectionCard title="Profile">
            <Field label="Agent code">{agent.agentCode}</Field>
            <Field label="State">{agent.stateCode}</Field>
            <Field label="Created">
              {new Date(agent.createdAt).toLocaleDateString('en-NG', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </Field>
            <Field label="Super-agent">
              {agent.isSuperAgent ? (
                <StatusPill tone="violet" icon={<GitBranch className="h-3 w-3" />}>
                  Active
                </StatusPill>
              ) : (
                <span className="text-xs text-slate-500">No</span>
              )}
            </Field>
          </SectionCard>
        </div>

        <SectionCard title="Recent remittances" padded={false}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-right">Owed</th>
                <th className="px-4 py-2 text-right">Paid</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {remits.slice(0, 6).map((r) => (
                <tr key={r.remittanceId}>
                  <td className="px-4 py-2 text-xs text-slate-500">{r.date}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNaira(r.owedNgn)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNaira(r.paidNgn)}</td>
                  <td className="px-4 py-2">
                    <StatusPill tone={statusToTone(r.status)}>{r.status}</StatusPill>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.receiptRef ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title="Commission ledger (last 4 entries)" padded={false}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-right">Basis</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2 text-right">Commission</th>
                <th className="px-4 py-2 text-right">Override</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {commission.map((c) => (
                <tr key={c.entryId}>
                  <td className="px-4 py-2 text-xs text-slate-500">{c.date}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNaira(c.basisNgn)}</td>
                  <td className="px-4 py-2 text-right">{(c.rate * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2 text-right font-bold tabular-nums text-navy-700">
                    {formatNaira(c.commissionNgn)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {c.overrideNgn > 0 ? formatNaira(c.overrideNgn) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill tone={statusToTone(c.status)}>{c.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>

      {actionOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setActionOpen(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-black text-[#1A1816]">
                  {actionOpen === 'suspend' ? 'Suspend agent' : 'Terminate agent'}
                </p>
                <p className="text-xs text-slate-500">
                  Requires dual approval — a second admin must confirm.
                </p>
              </div>
            </div>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for record…"
              className="w-full rounded-md border border-slate-200 p-3 text-sm font-medium outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setActionOpen(null)}
                className="rounded-md border-slate-200 bg-white"
              >
                Cancel
              </Button>
              <Button
                variant="accent"
                disabled={!reason.trim()}
                onClick={() => setActionOpen(null)}
                className="rounded-md !border-transparent bg-amber-500 font-black text-white hover:!border-transparent hover:bg-amber-600 disabled:!bg-slate-200 disabled:text-slate-500"
              >
                <Coins className="h-4 w-4" />
                Request second approval
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Phone;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-navy-50 text-navy-700">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-bold text-[#1A1816]">{children}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-bold text-[#1A1816]">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold text-[#1A1816]">{children}</p>
    </div>
  );
}
