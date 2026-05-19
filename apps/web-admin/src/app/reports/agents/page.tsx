'use client';

import Link from 'next/link';
import { Download } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type AdminAgent } from '@/lib/admin-mock';

export default function AgentsReportPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = [...adminMock.listAgents()].sort(
    (a, b) => b.monthlySalesNgn - a.monthlySalesNgn,
  );

  const download = () => {
    const csv = [
      'agent_code,full_name,state,tier,monthly_tickets,monthly_sales_ngn,compliance,super',
      ...rows.map(
        (a) =>
          `${a.agentCode},${a.fullName},${a.stateCode},${a.tier},${a.monthlyTicketCount},${a.monthlySalesNgn},${a.remittanceCompliance.toFixed(2)},${a.isSuperAgent ? 'Y' : 'N'}`,
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-performance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Reports · Agents"
        title="Agent performance"
        description="Ranked by MTD sales. Compliance below 80% triggers a finance review."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'Agents' },
        ]}
        rightSlot={
          <Button
            variant="secondary"
            onClick={download}
            className="rounded-md border-slate-200 bg-white text-[#1A1816]"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<AdminAgent>
          rows={rows}
          rowKey={(a) => a.agentCode}
          searchPlaceholder="Search agent…"
          searchFn={(a, q) =>
            a.fullName.toLowerCase().includes(q) ||
            a.agentCode.toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'rank',
              header: '#',
              render: (a) => (
                <span className="font-mono text-xs text-slate-500">
                  {rows.indexOf(a) + 1}
                </span>
              ),
            },
            {
              key: 'agent',
              header: 'Agent',
              render: (a) => (
                <Link
                  href={`/agents/${a.agentCode}`}
                  className="font-bold text-[#1A1816] hover:text-navy-700"
                >
                  {a.fullName}
                </Link>
              ),
            },
            { key: 'state', header: 'State', render: (a) => a.stateCode },
            {
              key: 'tier',
              header: 'Tier',
              render: (a) => <StatusPill tone={statusToTone(a.tier)}>{a.tier}</StatusPill>,
            },
            {
              key: 'tickets',
              header: 'MTD tickets',
              align: 'right',
              render: (a) => a.monthlyTicketCount,
            },
            {
              key: 'sales',
              header: 'MTD sales',
              align: 'right',
              render: (a) => (
                <span className="font-bold text-navy-700">
                  {formatNaira(a.monthlySalesNgn)}
                </span>
              ),
            },
            {
              key: 'compliance',
              header: 'Compliance',
              align: 'right',
              render: (a) => `${Math.round(a.remittanceCompliance * 100)}%`,
            },
          ]}
        />
      </div>
    </>
  );
}
