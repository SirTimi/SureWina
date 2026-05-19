'use client';

import { use, useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { Banknote, Lock, Receipt, TrendingUp } from 'lucide-react';
import { Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { TierBadge } from '@/components/tier-badge';
import { agentMock, type AgentSubAgent } from '@/lib/agent-mock';

export default function SubAgentDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  return (
    <AgentShell>
      {() => <SubAgentBody code={code} />}
    </AgentShell>
  );
}

function SubAgentBody({ code }: { code: string }) {
  const [sub, setSub] = useState<AgentSubAgent | null | undefined>(undefined);

  useEffect(() => {
    agentMock.getSubAgent(code).then(setSub);
  }, [code]);

  if (sub === undefined) {
    return (
      <main className="mx-auto max-w-[760px] px-4 pb-10 pt-5">
        <div className="h-32 animate-pulse rounded-3xl bg-white" />
      </main>
    );
  }

  if (sub === null) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-[760px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Super-agent · Sub-agent detail"
        title={sub.fullName}
        description="Read-only view. Override commission is finalised at month-end."
        backHref="/super-agent"
      />

      <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-sm font-black text-navy-950">{sub.agentCode}</p>
            <p className="text-xs text-slate-500 capitalize">
              Status · {sub.status.toLowerCase().replace('_', ' ')}
            </p>
          </div>
          <TierBadge tier={sub.tier} />
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Receipt className="h-4 w-4" />}
          label="Tickets MTD"
          value={String(sub.monthlyTicketCount)}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Sales MTD"
          value={formatNaira(sub.monthlySalesNgn)}
        />
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="Override earned"
          value={formatNaira(sub.overrideEarnedNgn)}
        />
      </div>

      <Card className="mt-3 rounded-3xl border-amber-200 bg-amber-50 p-4 text-amber-900">
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm">
            Granular sale-level breakdown and remittance trail unlock in Phase 2 along
            with super-agent payouts.
          </p>
        </div>
      </Card>
    </main>
  );
}

function StatCard({
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
      <p className="mt-1 truncate font-display text-lg font-black text-navy-950 tabular-nums">
        {value}
      </p>
    </Card>
  );
}
