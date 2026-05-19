'use client';

import Link from 'next/link';
import { ClipboardCheck, GitBranch } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type AdminAgent } from '@/lib/admin-mock';

export default function AgentsListPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listAgents();

  return (
    <>
      <PageHeader
        eyebrow="Agents"
        title="All agents"
        description="Status, tier, monthly volume, and remittance compliance at a glance."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Agents' }]}
        rightSlot={
          <div className="flex items-center gap-2">
            <Link
              href="/agents/super"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
            >
              <GitBranch className="h-4 w-4" />
              Super-agents
            </Link>
            <Link
              href="/agents/onboarding"
              className="inline-flex items-center gap-2 rounded-md bg-navy-800 px-4 py-2 text-sm font-black text-white hover:bg-navy-900"
            >
              <ClipboardCheck className="h-4 w-4" />
              Onboarding queue
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<AdminAgent>
          rows={rows}
          rowKey={(a) => a.agentCode}
          searchPlaceholder="Search agent code, name, phone…"
          searchFn={(a, q) =>
            a.agentCode.toLowerCase().includes(q) ||
            a.fullName.toLowerCase().includes(q) ||
            a.phoneE164.includes(q)
          }
          columns={[
            {
              key: 'agent',
              header: 'Agent',
              render: (a) => (
                <div>
                  <Link
                    href={`/agents/${a.agentCode}`}
                    className="font-bold text-[#0B1220] hover:text-navy-700"
                  >
                    {a.fullName}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">
                    {a.agentCode} · {a.stateCode}
                  </p>
                </div>
              ),
            },
            {
              key: 'tier',
              header: 'Tier',
              render: (a) => (
                <StatusPill
                  tone={
                    a.tier === 'GOLD'
                      ? 'warning'
                      : a.tier === 'SILVER'
                        ? 'neutral'
                        : 'info'
                  }
                >
                  {a.tier}
                </StatusPill>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (a) => <StatusPill tone={statusToTone(a.status)}>{a.status}</StatusPill>,
            },
            {
              key: 'sales',
              header: 'MTD sales',
              align: 'right',
              render: (a) => formatNaira(a.monthlySalesNgn),
            },
            {
              key: 'tickets',
              header: 'MTD tickets',
              align: 'right',
              render: (a) => a.monthlyTicketCount,
            },
            {
              key: 'compliance',
              header: 'Compliance',
              render: (a) => (
                <div className="inline-flex w-full max-w-[140px] items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={
                        a.remittanceCompliance < 0.8
                          ? 'h-full rounded-full bg-red-500'
                          : a.remittanceCompliance < 0.92
                            ? 'h-full rounded-full bg-amber-500'
                            : 'h-full rounded-full bg-emerald-500'
                      }
                      style={{ width: `${a.remittanceCompliance * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold tabular-nums">
                    {Math.round(a.remittanceCompliance * 100)}%
                  </span>
                </div>
              ),
            },
            {
              key: 'super',
              header: '',
              render: (a) =>
                a.isSuperAgent ? (
                  <StatusPill tone="violet" icon={<GitBranch className="h-3 w-3" />}>
                    Super
                  </StatusPill>
                ) : null,
            },
          ]}
        />
      </div>
    </>
  );
}
