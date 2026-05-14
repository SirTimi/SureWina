'use client';

import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type Dispute } from '@/lib/admin-mock';

export default function DisputesInboxPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listDisputes();

  return (
    <>
      <PageHeader
        eyebrow="Disputes"
        title="Disputes inbox"
        description="Customer disputes filed via app or support email. Assign, respond, resolve."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Disputes' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<Dispute>
          rows={rows}
          rowKey={(d) => d.disputeId}
          searchPlaceholder="Search subject or phone…"
          searchFn={(d, q) =>
            d.subject.toLowerCase().includes(q) ||
            d.customerPhoneE164.includes(q) ||
            (d.ticketRef ?? '').toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'subject',
              header: 'Subject',
              render: (d) => (
                <div>
                  <Link
                    href={`/disputes/${d.disputeId}`}
                    className="font-bold text-[#0B1220] hover:text-[#4E8F01]"
                  >
                    {d.subject}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">
                    {d.customerPhoneE164} {d.ticketRef ? `· ${d.ticketRef}` : ''}
                  </p>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (d) => <StatusPill tone={statusToTone(d.status)}>{d.status}</StatusPill>,
            },
            {
              key: 'priority',
              header: 'Priority',
              render: (d) => (
                <StatusPill
                  tone={
                    d.priority === 'HIGH'
                      ? 'danger'
                      : d.priority === 'MEDIUM'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {d.priority}
                </StatusPill>
              ),
            },
            {
              key: 'assignee',
              header: 'Assignee',
              render: (d) =>
                d.assignedTo ? (
                  <span className="text-xs text-slate-600">{d.assignedTo}</span>
                ) : (
                  <span className="text-xs italic text-slate-400">Unassigned</span>
                ),
            },
            {
              key: 'msgs',
              header: 'Msgs',
              align: 'right',
              render: (d) => String(d.messageCount),
            },
            {
              key: 'updated',
              header: 'Updated',
              render: (d) => (
                <span className="text-xs text-slate-500">
                  {new Date(d.lastUpdatedAt).toLocaleString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
