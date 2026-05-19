'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type PromoCampaign } from '@/lib/admin-mock';

export default function PromotionsListPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listPromos();

  return (
    <>
      <PageHeader
        eyebrow="System · Promotions"
        title="Promo codes & campaigns"
        description="Promo codes for ticket discounts, bonus entries, and seasonal campaigns."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Promotions' }]}
        rightSlot={
          <Link
            href="/promotions/new"
            className="inline-flex items-center gap-2 rounded-md bg-navy-800 px-4 py-2 text-sm font-black text-white hover:bg-navy-900"
          >
            <Plus className="h-4 w-4" />
            New campaign
          </Link>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<PromoCampaign>
          rows={rows}
          rowKey={(p) => p.campaignId}
          searchPlaceholder="Search promo name or code…"
          searchFn={(p, q) =>
            p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'name',
              header: 'Campaign',
              render: (p) => (
                <div>
                  <Link
                    href={`/promotions/${p.campaignId}`}
                    className="font-bold text-[#0B1220] hover:text-navy-700"
                  >
                    {p.name}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">{p.code}</p>
                </div>
              ),
            },
            {
              key: 'type',
              header: 'Type',
              render: (p) => (
                <span className="text-xs font-bold text-slate-600">
                  {p.type.replace(/_/g, ' ')}
                </span>
              ),
            },
            {
              key: 'value',
              header: 'Value',
              align: 'right',
              render: (p) =>
                p.type === 'PERCENTAGE_OFF'
                  ? `${p.value}%`
                  : p.type === 'FLAT_OFF'
                    ? `₦${p.value}`
                    : `×${p.value}`,
            },
            {
              key: 'redemptions',
              header: 'Redeemed',
              align: 'right',
              render: (p) => (
                <span className="font-bold tabular-nums">
                  {p.redemptions.toLocaleString('en-NG')} / {p.cap.toLocaleString('en-NG')}
                </span>
              ),
            },
            {
              key: 'window',
              header: 'Window',
              render: (p) => (
                <span className="text-xs text-slate-500">
                  {new Date(p.startsAt).toLocaleDateString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                  })}{' '}
                  →{' '}
                  {new Date(p.endsAt).toLocaleDateString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (p) => <StatusPill tone={statusToTone(p.status)}>{p.status}</StatusPill>,
            },
          ]}
        />
      </div>
    </>
  );
}
