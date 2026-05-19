'use client';

import {
  Banknote,
  BookOpen,
  CheckCircle2,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Card } from '@surewina/ui';
import type { AgentMe } from '@surewina/types';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { TierBadge } from '@/components/tier-badge';

export default function ProfilePage() {
  return (
    <AgentShell>
      {(agent) => <ProfileBody agent={agent} />}
    </AgentShell>
  );
}

function ProfileBody({ agent }: { agent: AgentMe }) {
  return (
    <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Profile"
        title="Your agent profile"
        description="Read-only for security. To update bank details or contact info, message Surewina support."
        backHref="/"
      />

      <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy-800 text-2xl font-black text-white">
            {agent.fullName
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              Agent
            </p>
            <p className="mt-1 font-display text-2xl font-black text-navy-950">
              {agent.fullName}
            </p>
            <p className="font-mono text-sm font-black text-navy-950">
              {agent.agentCode}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TierBadge tier={agent.tier} />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                {agent.status}
              </span>
              {agent.isSuperAgent && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
                  Super-agent
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InfoCard icon={<Phone className="h-4 w-4" />} label="Phone number" value={agent.phoneNumber} />
        <InfoCard
          icon={<User className="h-4 w-4" />}
          label="Registered state"
          value={agent.registeredStateCode}
        />
        <InfoCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Training completed"
          value={
            agent.trainingCompletedAt
              ? new Date(agent.trainingCompletedAt).toLocaleDateString('en-NG', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Not yet'
          }
        />
        <InfoCard
          icon={<BookOpen className="h-4 w-4" />}
          label="Agreement signed"
          value={
            agent.agentAgreementSignedAt
              ? new Date(agent.agentAgreementSignedAt).toLocaleDateString('en-NG', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Pending'
          }
        />
      </div>

      <Card className="mt-3 rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
            <Banknote className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              Settlement bank
            </p>
            {agent.bankAccount ? (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Field label="Bank" value={agent.bankAccount.bankName} />
                <Field
                  label="Account"
                  value={`••••${agent.bankAccount.accountNumber}`}
                  mono
                />
                <Field label="Holder" value={agent.bankAccount.accountName} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No bank account on file.</p>
            )}
          </div>
        </div>
      </Card>
    </main>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
        {icon}
      </div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-navy-950">{value}</p>
    </Card>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-[#F8FAF4] px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p
        className={
          mono
            ? 'mt-0.5 truncate font-mono text-sm font-black text-navy-950'
            : 'mt-0.5 truncate text-sm font-bold text-navy-950'
        }
      >
        {value}
      </p>
    </div>
  );
}
