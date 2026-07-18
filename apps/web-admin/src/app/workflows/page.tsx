'use client';

import Link from 'next/link';
import { Clock, Eye, GitPullRequestArrow, ShieldCheck } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { type AdminRole, roleLabel } from '@/lib/admin-auth';
import {
  listPendingWorkflowRequests,
  listWorkflowRequests,
  workflowStageLabel,
  workflowStatusLabel,
  workflowStatusTone,
  workflowTypeLabel,
  type WorkflowRequest,
} from '@/lib/workflow-mock';

export default function WorkflowsPage() {
  return (
    <AdminShell>
      {(session) => <Body role={session.tier} />}
    </AdminShell>
  );
}

function Body({ role }: { role: AdminRole }) {
  const workflows = listWorkflowRequests();
  const pending = listPendingWorkflowRequests();

  const intermediatePending = workflows.filter(
    (workflow) => workflow.requiredApproverRole === 'INTERMEDIATE_ADMIN',
  ).length;

  const superPending = workflows.filter(
    (workflow) => workflow.requiredApproverRole === 'SUPER_ADMIN',
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Operations · Approval workflow"
        title="Workflow requests"
        description="Sensitive actions move through initiation, first-level review, and final authorization before they become active."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Workflows' },
        ]}
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SummaryCard
            icon={<GitPullRequestArrow className="h-5 w-5" />}
            label="Total workflows"
            value={workflows.length.toLocaleString('en-NG')}
          />
          <SummaryCard
            icon={<Clock className="h-5 w-5" />}
            label="Pending"
            value={pending.length.toLocaleString('en-NG')}
            tone="warning"
          />
          <SummaryCard
            icon={<ShieldCheck className="h-5 w-5" />}
            label="Intermediate review"
            value={intermediatePending.toLocaleString('en-NG')}
            tone="info"
          />
          <SummaryCard
            icon={<ShieldCheck className="h-5 w-5" />}
            label="Super Admin approval"
            value={superPending.toLocaleString('en-NG')}
            tone="success"
          />
        </div>

        <SectionCard
          title="Role visibility note"
          description={`${roleLabel(role)} can view workflows allowed by the frontend role model. Auditor can query but cannot approve or reject.`}
        >
          <p className="text-sm leading-relaxed text-slate-500">
            This is the frontend workflow layer only. Backend persistence, audit logging,
            notifications, and real stage transitions will be added when the backend is connected.
          </p>
        </SectionCard>

        <DataTable<WorkflowRequest>
          rows={workflows}
          rowKey={(workflow) => workflow.workflowId}
          searchPlaceholder="Search workflow, initiator, target record…"
          searchFn={(workflow, query) =>
            workflow.title.toLowerCase().includes(query) ||
            workflow.targetRecordLabel.toLowerCase().includes(query) ||
            workflow.initiatorName.toLowerCase().includes(query) ||
            workflowTypeLabel(workflow.requestType).toLowerCase().includes(query)
          }
          columns={[
            {
              key: 'request',
              header: 'Request',
              render: (workflow) => (
                <div>
                  <Link
                    href={`/workflows/${workflow.workflowId}`}
                    className="font-bold text-[#0B1220] hover:text-navy-700 hover:underline"
                  >
                    {workflow.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {workflowTypeLabel(workflow.requestType)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-400">
                    {workflow.workflowId}
                  </p>
                </div>
              ),
            },
            {
              key: 'target',
              header: 'Target record',
              render: (workflow) => (
                <p className="max-w-[280px] text-sm font-semibold text-slate-600">
                  {workflow.targetRecordLabel}
                </p>
              ),
            },
            {
              key: 'initiator',
              header: 'Initiator',
              render: (workflow) => (
                <div>
                  <p className="font-bold text-[#0B1220]">{workflow.initiatorName}</p>
                  <p className="text-xs text-slate-500">
                    {roleLabel(workflow.initiatorRole)}
                  </p>
                </div>
              ),
            },
            {
              key: 'stage',
              header: 'Current stage',
              render: (workflow) => (
                <div>
                  <p className="font-bold text-[#0B1220]">
                    {workflowStageLabel(workflow.currentStage)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Required: {workflow.requiredApproverRole ? roleLabel(workflow.requiredApproverRole) : 'None'}
                  </p>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (workflow) => (
                <StatusPill tone={workflowStatusTone(workflow.status)}>
                  {workflowStatusLabel(workflow.status)}
                </StatusPill>
              ),
            },
            {
              key: 'updated',
              header: 'Updated',
              render: (workflow) => (
                <span className="text-xs text-slate-500">
                  {new Date(workflow.updatedAt).toLocaleString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ),
            },
            {
              key: 'action',
              header: '',
              align: 'right',
              render: (workflow) => (
                <Link
                  href={`/workflows/${workflow.workflowId}`}
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
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'info';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'info'
          ? 'border-sky-200 bg-sky-50 text-sky-800'
          : 'border-slate-200 bg-white text-[#0B1220]';

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white/70">
        {icon}
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-black tracking-[-0.04em]">
        {value}
      </p>
    </div>
  );
}