'use client';

import Link from 'next/link';
import { Eye, FlagTriangleRight, Plus, ShieldAlert } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import {
  escalationModuleLabel,
  escalationSeverityTone,
  escalationStatusLabel,
  escalationStatusTone,
  listAuditorEscalations,
  type AuditorEscalation,
} from '@/lib/escalations-mock';
import { roleLabel } from '@/lib/admin-auth';
import {type AdminSession } from '@/lib/admin-auth';

export default function EscalationsPage() {
  return (
    <AdminShell>
      {(session) => <Body session={session} />}
    </AdminShell>
  );
}

function Body({
  session,
}: {
  session: AdminSession;
}) {
  const escalations = listAuditorEscalations();

  return (
    <>
      <PageHeader
        eyebrow="Compliance · Escalations"
        title="Auditor escalation channel"
        description="Escalations are separate from normal approval workflow and route directly to management/Super Admin."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Escalations' },
        ]}
        rightSlot={
          <Link href="/escalations/new">
            <GuardedActionButton
              session={session}
              action="RAISE_ESCALATION"
              variant="accent"
              className="rounded-md font-black"
              icon={<Plus className="h-4 w-4" />}
            >
              Raise escalation
            </GuardedActionButton>
          </Link>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-relaxed text-violet-900">
          <div className="flex gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              You are signed in as <span className="font-bold">{roleLabel(session.tier)}</span>.
              Auditors can raise escalations, but they cannot approve, reject, edit, or participate in the normal workflow chain.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SummaryCard label="Total escalations" value={escalations.length.toLocaleString('en-NG')} />
          <SummaryCard
            label="Open"
            value={escalations.filter((item) => item.status === 'OPEN').length.toLocaleString('en-NG')}
            tone="danger"
          />
          <SummaryCard
            label="Under review"
            value={escalations.filter((item) => item.status === 'UNDER_MANAGEMENT_REVIEW').length.toLocaleString('en-NG')}
            tone="warning"
          />
          <SummaryCard
            label="Resolved"
            value={escalations.filter((item) => item.status === 'RESOLVED').length.toLocaleString('en-NG')}
            tone="success"
          />
        </div>

        <SectionCard
          title="Escalation routing rule"
          description="Escalations bypass the normal approval chain and go directly to management/Super Admin for response."
        >
          <p className="text-sm leading-relaxed text-slate-500">
            This is frontend-only. Later, each escalation should create a management notification,
            attach evidence, lock the audit reference, and store the management response permanently.
          </p>
        </SectionCard>

        <DataTable<AuditorEscalation>
          rows={escalations}
          rowKey={(item) => item.escalationId}
          searchPlaceholder="Search issue, module, record, raised by..."
          searchFn={(item, query) =>
            item.title.toLowerCase().includes(query) ||
            item.relatedRecord.toLowerCase().includes(query) ||
            item.raisedByName.toLowerCase().includes(query) ||
            escalationModuleLabel(item.module).toLowerCase().includes(query)
          }
          columns={[
            {
              key: 'issue',
              header: 'Issue',
              render: (item) => (
                <div>
                  <Link
                    href={`/escalations/${item.escalationId}`}
                    className="font-bold text-[#0B1220] hover:text-navy-700 hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-1 font-mono text-[11px] text-slate-400">
                    {item.escalationId}
                  </p>
                </div>
              ),
            },
            {
              key: 'module',
              header: 'Module / record',
              render: (item) => (
                <div>
                  <StatusPill tone={escalationSeverityTone(item.severity)}>
                    {item.severity}
                  </StatusPill>
                  <p className="mt-2 text-xs font-bold text-slate-600">
                    {escalationModuleLabel(item.module)}
                  </p>
                  <p className="max-w-[280px] text-xs leading-relaxed text-slate-500">
                    {item.relatedRecord}
                  </p>
                </div>
              ),
            },
            {
              key: 'raised',
              header: 'Raised by',
              render: (item) => (
                <div>
                  <p className="font-bold text-[#0B1220]">{item.raisedByName}</p>
                  <p className="text-xs text-slate-500">{roleLabel(item.raisedByRole)}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(item.raisedAt).toLocaleString('en-NG', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (item) => (
                <StatusPill tone={escalationStatusTone(item.status)}>
                  {escalationStatusLabel(item.status)}
                </StatusPill>
              ),
            },
            {
              key: 'assigned',
              header: 'Assigned to',
              render: (item) => (
                <p className="text-sm font-semibold text-slate-600">
                  {item.assignedTo}
                </p>
              ),
            },
            {
              key: 'action',
              header: '',
              align: 'right',
              render: (item) => (
                <Link
                  href={`/escalations/${item.escalationId}`}
                  className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Open
                </Link>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'danger'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-slate-200 bg-white text-[#0B1220]';

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-black tracking-[-0.04em]">
        {value}
      </p>
    </div>
  );
}