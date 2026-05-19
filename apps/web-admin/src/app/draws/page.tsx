'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Calendar, PlusCircle, Repeat } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type Draw, type DrawStatus } from '@/lib/admin-mock';

const STATUS_OPTIONS: Array<DrawStatus | 'ALL'> = [
  'ALL',
  'OPEN',
  'SCHEDULED',
  'EXECUTED',
  'DRAFT',
  'CANCELLED',
];

export default function DrawsListPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const [status, setStatus] = useState<DrawStatus | 'ALL'>('ALL');
  const rows = useMemo(
    () => adminMock.listDraws({ status: status === 'ALL' ? undefined : status }),
    [status],
  );

  return (
    <>
      <PageHeader
        eyebrow="Draws"
        title="All draws"
        description="Every draw in the system — past results, today's open draws, and the forward schedule."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Draws' }]}
        rightSlot={
          <div className="flex items-center gap-2">
            <Link
              href="/draws/templates"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
            >
              <Repeat className="h-4 w-4" />
              Recurring templates
            </Link>
            <Link
              href="/draws/new"
              className="inline-flex items-center gap-2 rounded-md bg-navy-800 px-4 py-2 text-sm font-black text-white hover:bg-navy-900"
            >
              <PlusCircle className="h-4 w-4" />
              New draw
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={
                status === s
                  ? 'rounded-md bg-[#0B1220] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white'
                  : 'rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 hover:bg-slate-50'
              }
            >
              {s}
            </button>
          ))}
        </div>

        <DataTable<Draw>
          rows={rows}
          rowKey={(d) => d.drawCode}
          searchPlaceholder="Search by code or prize…"
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
                    href={`/draws/${d.drawCode}`}
                    className="font-bold text-[#0B1220] hover:text-navy-700"
                  >
                    {d.prizeDescription}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">{d.drawCode}</p>
                </div>
              ),
            },
            {
              key: 'type',
              header: 'Type',
              render: (d) => (
                <span className="text-xs font-bold text-slate-600">
                  {d.drawType.replace('_', ' ')}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (d) => <StatusPill tone={statusToTone(d.status)}>{d.status}</StatusPill>,
            },
            {
              key: 'sold',
              header: 'Sold / cap',
              align: 'right',
              render: (d) => (
                <span className="font-display text-sm font-black tabular-nums">
                  {d.ticketsSold.toLocaleString('en-NG')} /{' '}
                  {d.ticketCap.toLocaleString('en-NG')}
                </span>
              ),
            },
            {
              key: 'prize',
              header: 'Prize value',
              align: 'right',
              render: (d) => formatNaira(d.prizeValueNgn),
            },
            {
              key: 'sched',
              header: 'Scheduled',
              render: (d) => (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar className="h-3 w-3" />
                  {new Date(d.scheduledAt).toLocaleString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (d) => (
                <Link
                  href={`/draws/${d.drawCode}`}
                  className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline"
                >
                  Open →
                </Link>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
