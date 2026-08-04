'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  GitBranch,
  Phone,
  PlayCircle,
  Receipt,
  TrendingUp,
  Trophy,
  XCircle,
} from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import type { AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

interface AgentDetail {
  agent: {
    agentId: string;
    agentCode: string;
    fullName: string;
    phoneNumber: string;
    email: string | null;
    registeredStateCode: string;
    status: 'PENDING_KYC' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
    tier: string;
    commissionRate: string | number;
    isSuperAgent: boolean;
    superAgentCode: string | null;
    trainingCompletedAt: string | null;
    agentAgreementSignedAt: string | null;
    createdAt: string;
  };
  lifetime: {
    grossSalesNgn: number;
    ticketsSold: number;
    saleCount: number;
    lastSaleAt: string | null;
  };
  openRemittances: { periodDate: string; amountDueNgn: number; status: string }[];
  outstandingNgn: number;
}

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AdminShell>
      {(session) => <Body id={id} session={session} />}
    </AdminShell>
  );
}

function Body({ id, session }: { id: string; session: AdminSession }) {
  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionOpen, setActionOpen] = useState<null | 'suspend' | 'terminate'>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.admin
      .agentDetail(id)
      .then((d) => setData(d as unknown as AgentDetail))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load agent.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const runAction = async (
    action: 'approve' | 'suspend' | 'reactivate' | 'terminate',
    withReason?: string,
  ) => {
    setBusy(true);
    try {
      await api.admin.agentAction(id, action, withReason);
      setActionOpen(null);
      setReason('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-bold text-red-700">{error}</p>
          <Link href="/agents" className="mt-3 inline-block text-sm font-black text-navy-700 hover:underline">
            Back to agents
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { agent, lifetime, openRemittances, outstandingNgn } = data;

  return (
    <>
      <PageHeader
        eyebrow="Agent"
        title={agent.fullName}
        description={`${agent.agentCode} · ${agent.registeredStateCode}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Agents', href: '/agents' },
          { label: agent.agentCode },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            <StatusPill tone={statusToTone(agent.status)}>{agent.status}</StatusPill>

            {agent.status === 'PENDING_KYC' && (
              <GuardedActionButton
                session={session}
                action="APPROVE_AGENT_ONBOARDING"
                icon={<CheckCircle2 className="h-4 w-4" />}
                onClick={() => runAction('approve')}
                className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                Approve
              </GuardedActionButton>
            )}

            {agent.status === 'ACTIVE' && (
              <GuardedActionButton
                session={session}
                action="SUSPEND_ADMIN"
                icon={<Ban className="h-4 w-4" />}
                onClick={() => setActionOpen('suspend')}
                className="rounded-md border-amber-200 bg-amber-50 text-amber-700"
              >
                Suspend
              </GuardedActionButton>
            )}

            {agent.status === 'SUSPENDED' && (
              <GuardedActionButton
                session={session}
                action="REACTIVATE_AGENT"
                icon={<PlayCircle className="h-4 w-4" />}
                onClick={() => runAction('reactivate')}
                className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                Reactivate
              </GuardedActionButton>
            )}

            {agent.status !== 'TERMINATED' && (
              <GuardedActionButton
                session={session}
                action="REVOKE_ADMIN"
                icon={<XCircle className="h-4 w-4" />}
                onClick={() => setActionOpen('terminate')}
                className="rounded-md border-red-200 bg-red-50 text-red-700"
              >
                Terminate
              </GuardedActionButton>
            )}
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {actionOpen && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-black text-[#0B1220]">
              {actionOpen === 'suspend' ? 'Suspend this agent' : 'Terminate this agent'}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              A reason is recorded in the audit log and cannot be edited afterwards.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Reason for this action…"
              className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-navy-700"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy || reason.trim().length < 4}
                onClick={() => runAction(actionOpen, reason.trim())}
                className="rounded-md bg-[#0B1220] px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {busy ? 'Working…' : `Confirm ${actionOpen}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionOpen(null);
                  setReason('');
                }}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={Phone} label="Phone">{agent.phoneNumber}</Stat>
          <Stat icon={Trophy} label="Tier">{agent.tier}</Stat>
          <Stat icon={TrendingUp} label="Lifetime sales">{formatNaira(lifetime.grossSalesNgn)}</Stat>
          <Stat icon={Receipt} label="Lifetime tickets">{lifetime.ticketsSold.toLocaleString('en-NG')}</Stat>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            title="Open remittances"
            description={`${formatNaira(outstandingNgn)} outstanding across ${openRemittances.length} period${openRemittances.length === 1 ? '' : 's'}.`}
            padded={false}
          >
            <table className="min-w-full text-sm">
              <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Period</th>
                  <th className="px-4 py-2 text-right">Amount due</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openRemittances.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">
                      No open remittances — this agent is settled.
                    </td>
                  </tr>
                ) : (
                  openRemittances.map((r) => (
                    <tr key={r.periodDate}>
                      <td className="px-4 py-2 text-xs text-slate-500">{r.periodDate}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatNaira(r.amountDueNgn)}</td>
                      <td className="px-4 py-2">
                        <StatusPill tone={statusToTone(r.status)}>{r.status}</StatusPill>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </SectionCard>

          <SectionCard title="Profile">
            <Field label="Agent code">{agent.agentCode}</Field>
            <Field label="State">{agent.registeredStateCode}</Field>
            <Field label="Commission rate">{Math.round(Number(agent.commissionRate) * 100)}%</Field>
            <Field label="Sales recorded">{lifetime.saleCount.toLocaleString('en-NG')}</Field>
            <Field label="Last sale">
              {lifetime.lastSaleAt
                ? new Date(lifetime.lastSaleAt).toLocaleString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'No sales yet'}
            </Field>
            <Field label="Created">
              {new Date(agent.createdAt).toLocaleDateString('en-NG', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </Field>
            <Field label="Super-agent">
              {agent.isSuperAgent ? (
                <StatusPill tone="violet" icon={<GitBranch className="h-3 w-3" />}>Active</StatusPill>
              ) : (
                <span className="text-xs text-slate-500">No</span>
              )}
            </Field>
          </SectionCard>
        </div>
      </div>
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-navy-50 text-navy-700">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 truncate font-display text-lg font-black text-[#0B1220]">{children}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-[#0B1220]">{children}</span>
    </div>
  );
}