'use client';

import Link from 'next/link';
import { Download, FileSignature } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type Payout } from '@/lib/admin-mock';

export default function WhtCertificatesPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listPayouts().filter((p) => p.whtCertificateNo);

  return (
    <>
      <PageHeader
        eyebrow="Reports · WHT"
        title="Withholding tax certificates"
        description="Issued automatically when a payout is marked PAID. Each certificate is a downloadable artefact for the recipient and FIRS filings."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'WHT' },
        ]}
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<Payout>
          rows={rows}
          rowKey={(p) => p.payoutId}
          searchPlaceholder="Search certificate number, customer…"
          searchFn={(p, q) =>
            (p.whtCertificateNo ?? '').toLowerCase().includes(q) ||
            p.customerName.toLowerCase().includes(q) ||
            p.customerPhoneE164.includes(q)
          }
          columns={[
            {
              key: 'cert',
              header: 'Certificate',
              render: (p) => (
                <span className="font-mono text-xs font-black text-[#1A1816]">
                  {p.whtCertificateNo}
                </span>
              ),
            },
            {
              key: 'customer',
              header: 'Customer',
              render: (p) => (
                <div>
                  <p className="font-bold text-[#1A1816]">{p.customerName}</p>
                  <p className="font-mono text-xs text-slate-500">{p.customerPhoneE164}</p>
                </div>
              ),
            },
            { key: 'ref', header: 'Ticket', render: (p) => p.ticketRef },
            { key: 'gross', header: 'Gross', align: 'right', render: (p) => formatNaira(p.amountNgn) },
            { key: 'wht', header: 'WHT', align: 'right', render: (p) => formatNaira(p.whtNgn) },
            {
              key: 'status',
              header: 'Payout',
              render: (p) => <StatusPill tone={statusToTone(p.status)}>{p.status}</StatusPill>,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (p) => (
                <Link
                  href={`/payouts/${p.payoutId}`}
                  className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline"
                >
                  <FileSignature className="h-3 w-3" />
                  Open
                </Link>
              ),
            },
          ]}
          toolbar={
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-[#1A1816]"
            >
              <Download className="h-4 w-4" />
              Bulk export
            </button>
          }
        />
      </div>
    </>
  );
}
