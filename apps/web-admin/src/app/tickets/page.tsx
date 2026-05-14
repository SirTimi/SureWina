'use client';

import Link from 'next/link';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type AdminTicket } from '@/lib/admin-mock';

export default function TicketsListPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listTickets();

  return (
    <>
      <PageHeader
        eyebrow="Tickets"
        title="All tickets"
        description="Searchable by ticket reference, customer phone, or draw code."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Tickets' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<AdminTicket>
          rows={rows}
          rowKey={(t) => t.ticketRef}
          searchPlaceholder="Search ticket ref, phone, draw…"
          searchFn={(t, q) =>
            t.ticketRef.toLowerCase().includes(q) ||
            t.customerPhoneE164.includes(q) ||
            t.drawCode.toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'ref',
              header: 'Ticket',
              render: (t) => (
                <Link
                  href={`/tickets/${t.ticketRef}`}
                  className="font-mono text-sm font-black text-[#0B1220] hover:text-[#4E8F01]"
                >
                  {t.ticketRef}
                </Link>
              ),
            },
            {
              key: 'draw',
              header: 'Draw',
              render: (t) => (
                <span className="font-mono text-xs text-slate-600">{t.drawCode}</span>
              ),
            },
            {
              key: 'customer',
              header: 'Customer',
              render: (t) => (
                <span className="font-mono text-xs">{t.customerPhoneE164}</span>
              ),
            },
            {
              key: 'channel',
              header: 'Channel',
              render: (t) => (
                <span className="text-xs font-bold text-slate-600">{t.channel}</span>
              ),
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (t) => formatNaira(t.amountNgn),
            },
            {
              key: 'payment',
              header: 'Payment',
              render: (t) => (
                <StatusPill tone={statusToTone(t.paymentStatus)}>
                  {t.paymentStatus}
                </StatusPill>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (t) => (
                <StatusPill tone={statusToTone(t.status)}>{t.status}</StatusPill>
              ),
            },
            {
              key: 'created',
              header: 'When',
              render: (t) => (
                <span className="text-xs text-slate-500">
                  {new Date(t.createdAt).toLocaleString('en-NG', {
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
