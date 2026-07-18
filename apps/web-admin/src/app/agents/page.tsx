'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ClipboardCheck, GitBranch } from 'lucide-react';
import type { AdminAgentRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { api } from '@/lib/api';

export default function AgentsListPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const [rows, setRows] = useState<AdminAgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin
      .listAgents()
      .then((res) => setRows(res.agents))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Agents"
        title="All agents"
        description="Status, tier, and commission rate. Open an agent to review activity and lifecycle."
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
        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : (
          <DataTable<AdminAgentRow>
            rows={rows}
            rowKey={(a) => a.agentId}
            searchPlaceholder="Search agent code, name, phone…"
            searchFn={(a, q) =>
              a.agentCode.toLowerCase().includes(q) ||
              a.fullName.toLowerCase().includes(q) ||
              a.phoneNumber.includes(q)
            }
            columns={[
              {
                key: 'agent',
                header: 'Agent',
                render: (a) => (
                  <div>
                    <Link
                      href={`/agents/${a.agentId}`}
                      className="font-bold text-[#0B1220] hover:text-navy-700"
                    >
                      {a.fullName}
                    </Link>
                    <p className="font-mono text-xs text-slate-500">
                      {a.agentCode} · {a.registeredStateCode}
                    </p>
                  </div>
                ),
              },
              {
                key: 'phone',
                header: 'Phone',
                render: (a) => <span className="font-mono text-xs">{a.phoneNumber}</span>,
              },
              {
                key: 'tier',
                header: 'Tier',
                render: (a) => (
                  <StatusPill
                    tone={a.tier === 'GOLD' ? 'warning' : a.tier === 'SILVER' ? 'neutral' : 'info'}
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
                key: 'rate',
                header: 'Commission',
                align: 'right',
                render: (a) => `${Math.round(Number(a.commissionRate) * 100)}%`,
              },
              {
                key: 'joined',
                header: 'Joined',
                align: 'right',
                render: (a) =>
                  new Date(a.createdAt).toLocaleDateString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  }),
              },
            ]}
          />
        )}
      </div>
    </>
  );
}