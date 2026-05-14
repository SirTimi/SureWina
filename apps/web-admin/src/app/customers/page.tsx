'use client';

import Link from 'next/link';
import { Flag } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type AdminCustomer } from '@/lib/admin-mock';

export default function CustomersPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listCustomers();

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Customer search"
        description="Find customers by phone number or display name. Use the detail view for full history."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Customers' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<AdminCustomer>
          rows={rows}
          rowKey={(c) => c.customerId}
          searchPlaceholder="Search phone or name…"
          searchFn={(c, q) =>
            c.phoneE164.includes(q) ||
            (c.displayName ?? '').toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'phone',
              header: 'Phone',
              render: (c) => (
                <Link
                  href={`/customers/${c.customerId}`}
                  className="font-mono text-sm font-bold text-[#0B1220] hover:text-[#4E8F01]"
                >
                  {c.phoneE164}
                </Link>
              ),
            },
            {
              key: 'name',
              header: 'Name',
              render: (c) =>
                c.displayName ?? (
                  <span className="text-xs italic text-slate-400">Not provided</span>
                ),
            },
            {
              key: 'kyc',
              header: 'KYC',
              render: (c) => (
                <StatusPill tone={statusToTone(c.kycStatus)}>{c.kycStatus}</StatusPill>
              ),
            },
            {
              key: 'tickets',
              header: 'Tickets',
              align: 'right',
              render: (c) => c.ticketCount.toLocaleString('en-NG'),
            },
            {
              key: 'spend',
              header: 'Spend',
              align: 'right',
              render: (c) => formatNaira(c.lifetimeSpendNgn),
            },
            {
              key: 'prizes',
              header: 'Prizes won',
              align: 'right',
              render: (c) =>
                c.lifetimePrizeNgn > 0 ? (
                  <span className="font-bold text-emerald-700">
                    {formatNaira(c.lifetimePrizeNgn)}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            },
            {
              key: 'flag',
              header: '',
              render: (c) =>
                c.flagged ? (
                  <StatusPill tone="warning" icon={<Flag className="h-3 w-3" />}>
                    Flagged
                  </StatusPill>
                ) : null,
            },
          ]}
        />
      </div>
    </>
  );
}
