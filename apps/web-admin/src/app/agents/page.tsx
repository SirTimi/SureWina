'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ClipboardCheck, GitBranch, Search } from 'lucide-react';
import type { AdminAgentRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { api } from '@/lib/api';

const PAGE_SIZE = 20;

export default function AgentsListPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const [rows, setRows] = useState<AdminAgentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Searching on the server rather than filtering what is already loaded.
  // Only one page is ever in memory, so a client-side filter would miss any
  // agent outside it — which is precisely the case someone searching by
  // terminal number is in.
  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      api.admin
        .listAgents({ search: search.trim() || undefined, page, pageSize: PAGE_SIZE })
        .then((res) => {
          setRows(res.agents);
          setTotal(res.total);
        })
        .catch(() => {
          setRows([]);
          setTotal(0);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(handle);
  }, [search, page]);

  // A new search starts from the first page; staying on page 3 of the old
  // result set would show nothing and look broken.
  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search terminal number, agent code, name or phone…"
            className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-navy-700"
          />
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            {search
              ? `No agent matches “${search}”.`
              : 'No agents registered yet.'}
          </div>
        ) : (
          <DataTable<AdminAgentRow>
            rows={rows}
            rowKey={(a) => a.agentId}
            columns={[
              {
                key: 'terminal',
                header: 'Terminal',
                render: (a) => (
                  <span className="font-mono text-sm font-black text-[#0B1220]">
                    {a.terminalNumber ?? '—'}
                  </span>
                ),
              },
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

        {!loading && total > PAGE_SIZE && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}