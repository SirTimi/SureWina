'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type KycCase } from '@/lib/admin-mock';

export default function KycReviewQueuePage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listKycCases();

  return (
    <>
      <PageHeader
        eyebrow="KYC"
        title="Manual review queue"
        description="Higher-tier and flagged KYC cases that need a human eye. Auto-pass cases skip this list."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'KYC review' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<KycCase>
          rows={rows}
          rowKey={(k) => k.kycCaseId}
          searchPlaceholder="Search phone or case id…"
          searchFn={(k, q) =>
            k.customerPhoneE164.includes(q) ||
            k.kycCaseId.toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'case',
              header: 'Case',
              render: (k) => (
                <div>
                  <Link
                    href={`/kyc/review/${k.kycCaseId}`}
                    className="font-mono text-sm font-black text-[#0B1220] hover:text-[#4E8F01]"
                  >
                    {k.kycCaseId}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">
                    {k.customerPhoneE164}
                  </p>
                </div>
              ),
            },
            {
              key: 'level',
              header: 'Level',
              render: (k) => <StatusPill tone="info">{k.level}</StatusPill>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (k) => <StatusPill tone={statusToTone(k.status)}>{k.status}</StatusPill>,
            },
            {
              key: 'docs',
              header: 'Docs',
              align: 'right',
              render: (k) => k.docs.length,
            },
            {
              key: 'reviewer',
              header: 'Reviewer',
              render: (k) =>
                k.reviewer ? (
                  <span className="text-xs text-slate-600">{k.reviewer}</span>
                ) : (
                  <span className="text-xs italic text-slate-400">Unassigned</span>
                ),
            },
            {
              key: 'flags',
              header: 'Flags',
              render: (k) =>
                k.flags.length > 0 ? (
                  <StatusPill tone="warning" icon={<AlertTriangle className="h-3 w-3" />}>
                    {k.flags.length} flag{k.flags.length > 1 ? 's' : ''}
                  </StatusPill>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            },
            {
              key: 'submitted',
              header: 'Submitted',
              render: (k) => (
                <span className="text-xs text-slate-500">
                  {new Date(k.submittedAt).toLocaleDateString('en-NG', {
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
