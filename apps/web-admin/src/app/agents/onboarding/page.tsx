'use client';

import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type AgentOnboarding } from '@/lib/admin-mock';

export default function OnboardingQueuePage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listAgentApplications();

  return (
    <>
      <PageHeader
        eyebrow="Agents · Onboarding"
        title="KYC review queue"
        description="Applications submitted by prospective agents. Approve, reject, or request additional documents."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Agents', href: '/agents' },
          { label: 'Onboarding' },
        ]}
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<AgentOnboarding>
          rows={rows}
          rowKey={(a) => a.applicationId}
          searchPlaceholder="Search name or phone…"
          searchFn={(a, q) =>
            a.fullName.toLowerCase().includes(q) || a.phoneE164.includes(q)
          }
          columns={[
            {
              key: 'applicant',
              header: 'Applicant',
              render: (a) => (
                <div>
                  <Link
                    href={`/agents/onboarding/${a.applicationId}`}
                    className="font-bold text-[#1A1816] hover:text-navy-700"
                  >
                    {a.fullName}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">
                    {a.phoneE164} · {a.stateCode}
                  </p>
                </div>
              ),
            },
            {
              key: 'docs',
              header: 'Docs',
              render: (a) => (
                <span className="text-xs text-slate-600">
                  {a.docsSubmitted.length} uploaded
                </span>
              ),
            },
            {
              key: 'bvn',
              header: 'BVN ····',
              render: (a) => (
                <span className="font-mono text-xs">•••{a.bvnHashLastFour}</span>
              ),
            },
            {
              key: 'reviewer',
              header: 'Reviewer',
              render: (a) =>
                a.reviewer ? (
                  <span className="text-xs text-slate-600">{a.reviewer}</span>
                ) : (
                  <span className="text-xs italic text-slate-400">Unassigned</span>
                ),
            },
            {
              key: 'submitted',
              header: 'Submitted',
              render: (a) => (
                <span className="text-xs text-slate-500">
                  {new Date(a.submittedAt).toLocaleString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (a) => <StatusPill tone={statusToTone(a.status)}>{a.status}</StatusPill>,
            },
          ]}
        />
      </div>
    </>
  );
}
