'use client';

import Link from 'next/link';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type Payout } from '@/lib/admin-mock';

export default function PayoutsPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listPayouts();
  const queued = rows.filter((p) => p.status === 'AWAITING_APPROVAL').length;

  return (
    <>
      <PageHeader
        eyebrow="Payouts"
        title="Cash payout queue"
        description={`${queued} payouts awaiting approval. Approvers must be Finance officers.`}
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Payouts' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<Payout>
          rows={rows}
          rowKey={(p) => p.payoutId}
          searchPlaceholder="Search by name, phone, ticket…"
          searchFn={(p, q) =>
            p.customerName.toLowerCase().includes(q) ||
            p.customerPhoneE164.includes(q) ||
            p.ticketRef.toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'customer',
              header: 'Customer',
              render: (p) => (
                <div>
                  <Link
                    href={`/payouts/${p.payoutId}`}
                    className="font-bold text-[#0B1220] hover:text-navy-700"
                  >
                    {p.customerName}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">
                    {p.customerPhoneE164} · {p.ticketRef}
                  </p>
                </div>
              ),
            },
            {
              key: 'gross',
              header: 'Gross',
              align: 'right',
              render: (p) => formatNaira(p.amountNgn),
            },
            {
              key: 'wht',
              header: 'WHT',
              align: 'right',
              render: (p) => (
                <span className="text-red-700">-{formatNaira(p.whtNgn)}</span>
              ),
            },
            {
              key: 'net',
              header: 'Net',
              align: 'right',
              render: (p) => (
                <span className="font-bold text-navy-700">{formatNaira(p.netNgn)}</span>
              ),
            },
            {
              key: 'method',
              header: 'Method',
              render: (p) =>
                p.paymentMethod ? (
                  <span className="text-xs text-slate-600">
                    {p.paymentMethod.replace('_', ' ')}
                  </span>
                ) : (
                  <span className="text-xs italic text-slate-400">Pending</span>
                ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (p) => <StatusPill tone={statusToTone(p.status)}>{p.status}</StatusPill>,
            },
            {
              key: 'created',
              header: 'Created',
              render: (p) => (
                <span className="text-xs text-slate-500">
                  {new Date(p.createdAt).toLocaleDateString('en-NG', {
                    day: '2-digit',
                    month: 'short',
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
