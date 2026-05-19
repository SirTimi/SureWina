'use client';

import Link from 'next/link';
import { Download } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type Draw } from '@/lib/admin-mock';

export default function DrawAuditReportPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock
    .listDraws()
    .filter((d) => d.status === 'EXECUTED' || d.status === 'OPEN');

  return (
    <>
      <PageHeader
        eyebrow="Reports · Draws"
        title="Draw audit packs"
        description="Per-draw audit summary. Each row links to a downloadable audit PDF."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'Draws' },
        ]}
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<Draw>
          rows={rows}
          rowKey={(d) => d.drawCode}
          searchPlaceholder="Search draw…"
          searchFn={(d, q) =>
            d.drawCode.toLowerCase().includes(q) ||
            d.prizeDescription.toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'draw',
              header: 'Draw',
              render: (d) => (
                <div>
                  <Link
                    href={`/draws/${d.drawCode}/audit`}
                    className="font-bold text-[#1A1816] hover:text-navy-700"
                  >
                    {d.prizeDescription}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">{d.drawCode}</p>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (d) => <StatusPill tone={statusToTone(d.status)}>{d.status}</StatusPill>,
            },
            {
              key: 'tickets',
              header: 'Tickets sold',
              align: 'right',
              render: (d) => d.ticketsSold.toLocaleString('en-NG'),
            },
            {
              key: 'prize',
              header: 'Prize value',
              align: 'right',
              render: (d) => formatNaira(d.prizeValueNgn),
            },
            {
              key: 'winner',
              header: 'Winner',
              render: (d) =>
                d.winnerTicketRef ? (
                  <span className="font-mono text-xs">{d.winnerTicketRef}</span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (d) => (
                <Link
                  href={`/draws/${d.drawCode}/audit`}
                  className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline"
                >
                  <Download className="h-3 w-3" />
                  Pack
                </Link>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
