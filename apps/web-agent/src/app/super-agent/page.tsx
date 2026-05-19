'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Crown, Network, Sparkles, Users } from 'lucide-react';
import { Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { TierBadge } from '@/components/tier-badge';
import { agentMock, type AgentSubAgent } from '@/lib/agent-mock';

export default function SuperAgentPage() {
  return (
    <AgentShell>
      {() => <SuperAgentBody />}
    </AgentShell>
  );
}

function SuperAgentBody() {
  const [subs, setSubs] = useState<AgentSubAgent[] | null>(null);

  useEffect(() => {
    agentMock.listSubAgents().then(setSubs);
  }, []);

  const totals = (subs ?? []).reduce(
    (acc, s) => ({
      tickets: acc.tickets + s.monthlyTicketCount,
      sales: acc.sales + s.monthlySalesNgn,
      override: acc.override + s.overrideEarnedNgn,
    }),
    { tickets: 0, sales: 0, override: 0 },
  );

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Super-agent · Phase 2 preview"
        title="Your sub-agent network"
        description="Track sub-agent performance and the override commission your network earns you."
        backHref="/"
      />

      <Card className="rounded-3xl border-navy-100 bg-gradient-to-br from-navy-800 to-navy-900 p-5 text-white shadow-[0_24px_60px_rgba(14,42,71,0.16)]">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur">
            <Crown className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-400">
              Network overview
            </p>
            <p className="mt-1 font-display text-2xl font-black leading-tight">
              You oversee {subs?.length ?? '—'} active sub-agents
            </p>
            <p className="mt-1 text-sm text-white/75">
              You earn a 2% override on every ticket your sub-agents sell.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <SummaryStat label="Tickets" value={String(totals.tickets)} />
          <SummaryStat label="Network sales" value={formatNaira(totals.sales)} />
          <SummaryStat label="Override earned" value={formatNaira(totals.override)} />
        </div>
      </Card>

      <Card className="mt-4 rounded-3xl border-amber-200 bg-amber-50 p-4 text-amber-900">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm">
            Override commission disbursement lands in Phase 2. For now this view is
            read-only.
          </p>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Sub-agents
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Tap any sub-agent for a read-only performance view.
              </p>
            </div>
          </div>
          <Users className="h-5 w-5 text-slate-300" />
        </div>

        <div className="grid grid-cols-1 gap-2 p-3">
          {!subs ? (
            <>
              <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
            </>
          ) : (
            subs.map((sub) => (
              <Link
                key={sub.agentCode}
                href={`/super-agent/${sub.agentCode}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-navy-200 hover:bg-[#F8FAF4]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-50 font-black text-navy-700">
                    {sub.fullName
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-navy-950">
                      {sub.fullName}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">
                      {sub.agentCode}
                    </p>
                  </div>
                </div>

                <div className="hidden items-center gap-3 sm:flex">
                  <TierBadge tier={sub.tier} />
                  <div className="text-right">
                    <p className="font-display text-sm font-black text-navy-950">
                      {sub.monthlyTicketCount}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      tickets MTD
                    </p>
                  </div>
                </div>

                <ArrowRight className="h-4 w-4 shrink-0 text-navy-700" />
              </Link>
            ))
          )}
        </div>
      </Card>
    </main>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-400">
        {label}
      </p>
      <p className="mt-1 truncate font-display text-xl font-black text-white">{value}</p>
    </div>
  );
}
