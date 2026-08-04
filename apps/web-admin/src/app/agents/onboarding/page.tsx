'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, UserPlus, ShieldCheck } from 'lucide-react';
import type { AdminAgentRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/api';

import { canPerformAction, type AdminSession } from '@/lib/admin-auth';

export default function AgentOnboardingPage() {
  return <AdminShell>{(session) => <Body session={session} />}</AdminShell>;
}

function Body({ session }: { session: AdminSession }) {
  const [rows, setRows] = useState<AdminAgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canActivate = canPerformAction(session, 'APPROVE_AGENT_ONBOARDING');

  const load = () => {
    setLoading(true);
    api.admin
      .listAgents({status: 'PENDING_KYC'})
      .then((res) => setRows(res.agents))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load onboarding queue.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const approve = async (agentId: string, name: string) => {
    if (busyId) return;

    if (
      !window.confirm(
        `Activate ${name}?\n\nYou are confirming that KYC, training, and the signed agent agreement are all complete. They will be able to sell immediately.`,
      )
    ) {
      return;
    }

    setBusyId(agentId);
    setError(null);
    try {
      await api.admin.approveAgent(agentId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activation failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Agents"
        title="Onboarding"
        description="Agents registered in office, awaiting compliance sign-off."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Agents', href: '/agents' },
          { label: 'Onboarding' },
        ]}
        rightSlot={
          <Link
            href="/agents/onboarding/new"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-black text-accent-foreground shadow-sm hover:bg-amber-400"
          >
            <UserPlus className="h-4 w-4" />
            Register agent
          </Link>
        }
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {!canActivate && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-navy-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p>
              <span className="font-black">Activation sits with compliance.</span> You can register
              agents and track this queue, but the sign-off itself is performed by a compliance
              officer.
            </p>
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : rows.length === 0 ? (
          <SectionCard title="Nothing awaiting sign-off">            <div className="py-8 text-center">
              <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                Every registered agent has been reviewed. Use “Register agent” to onboard someone new.              </p>
            </div>
          </SectionCard>
        ) : (
          <SectionCard
            title={`${rows.length} awaiting sign-off`}
            description="Compliance confirms KYC, training, and the signed agreement before an agent is activated."
            padded={false}
          >
            <table className="min-w-full text-sm">
              <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Agent</th>
                  <th className="px-4 py-2 text-left">Phone</th>
                  <th className="px-4 py-2 text-left">State</th>
                  <th className="px-4 py-2 text-left">Registered</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => (
                  <tr key={a.agentId}>
                    <td className="px-4 py-3">
                      <Link href={`/agents/${a.agentId}`} className="font-bold text-[#0B1220] hover:text-navy-700">
                        {a.fullName}
                      </Link>
                      <p className="font-mono text-xs text-slate-500">{a.agentCode}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{a.phoneNumber}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.registeredStateCode}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(a.createdAt).toLocaleDateString('en-NG', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone="warning">PENDING KYC</StatusPill>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <GuardedActionButton
                        session={session}
                        action="APPROVE_AGENT_ONBOARDING"
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        onClick={() => approve(a.agentId, a.fullName)}
                        isLoading={busyId === a.agentId}
                        className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        {busyId === a.agentId ? 'Working…' : 'Activate'}
                      </GuardedActionButton>
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