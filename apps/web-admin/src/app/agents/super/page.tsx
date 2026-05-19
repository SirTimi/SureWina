'use client';

import Link from 'next/link';
import { Crown, Pencil } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type AdminAgent, type CommissionTierConfig } from '@/lib/admin-mock';

export default function SuperAgentsPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const supers = adminMock.getSuperAgents();
  const tiers = adminMock.getCommissionTiers();
  const networkAgents = adminMock.listAgents();

  return (
    <>
      <PageHeader
        eyebrow="Agents · Super"
        title="Super-agent management"
        description="Super-agents earn override commissions on their sub-agent network's sales."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Agents', href: '/agents' },
          { label: 'Super-agents' },
        ]}
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <DataTable<AdminAgent>
          rows={supers}
          rowKey={(a) => a.agentCode}
          searchPlaceholder="Search super-agents…"
          searchFn={(a, q) =>
            a.fullName.toLowerCase().includes(q) || a.agentCode.toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'agent',
              header: 'Super-agent',
              render: (a) => (
                <div className="flex items-start gap-2">
                  <Crown className="mt-0.5 h-4 w-4 text-navy-700" />
                  <div>
                    <Link
                      href={`/agents/${a.agentCode}`}
                      className="font-bold text-[#0B1220] hover:text-navy-700"
                    >
                      {a.fullName}
                    </Link>
                    <p className="font-mono text-xs text-slate-500">{a.agentCode}</p>
                  </div>
                </div>
              ),
            },
            {
              key: 'subs',
              header: 'Sub-agents',
              align: 'right',
              render: (a) =>
                networkAgents.filter((s) => s.superAgentCode === a.agentCode).length,
            },
            {
              key: 'sales',
              header: 'Network sales',
              align: 'right',
              render: (a) => formatNaira(a.monthlySalesNgn * 3),
            },
            {
              key: 'override',
              header: 'Override earned',
              align: 'right',
              render: (a) => formatNaira(Math.round(a.monthlySalesNgn * 0.02 * 3)),
            },
            {
              key: 'status',
              header: 'Status',
              render: (a) => <StatusPill tone={statusToTone(a.status)}>{a.status}</StatusPill>,
            },
          ]}
        />

        <SectionCard
          title="Commission tier configuration"
          description="Edit rates carefully — changes affect all agents in the next disbursement cycle."
          padded={false}
          rightSlot={
            <Button
              variant="secondary"
              className="rounded-md border-slate-200 bg-white text-[#0B1220]"
            >
              <Pencil className="h-4 w-4" />
              Edit tiers
            </Button>
          }
        >
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Tier</th>
                <th className="px-4 py-2 text-right">Min monthly tickets</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2 text-right">Bonus (₦)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tiers.map((t: CommissionTierConfig) => (
                <tr key={t.tier}>
                  <td className="px-4 py-2">
                    <StatusPill
                      tone={
                        t.tier === 'GOLD'
                          ? 'warning'
                          : t.tier === 'SILVER'
                            ? 'neutral'
                            : 'info'
                      }
                    >
                      {t.tier}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {t.minMonthlyTickets}
                  </td>
                  <td className="px-4 py-2 text-right font-bold tabular-nums text-navy-700">
                    {(t.rate * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {t.bonusNgn > 0 ? formatNaira(t.bonusNgn) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </>
  );
}
