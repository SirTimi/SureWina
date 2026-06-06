'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  GitPullRequestArrow,
  History,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Card } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import {
  type AdminRole,
  type AdminSession,
  roleLabel,
} from '@/lib/admin-auth';
import {
  getNextWorkflowPreview,
  getWorkflowRequest,
  workflowStageLabel,
  workflowStatusLabel,
  workflowStatusTone,
  workflowTypeLabel,
} from '@/lib/workflow-mock';
import { createWorkflowStageNotification } from '@/lib/notifications-mock';

export default function WorkflowDetailPage() {
  const params = useParams<{ workflowId: string }>();
  const workflow = getWorkflowRequest(params.workflowId);

  if (!workflow) {
    return (
      <AdminShell>
        {() => (
          <div className="mx-auto max-w-[720px] px-6 py-16">
            <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-8 text-center shadow-sm">
              <h1 className="font-display text-3xl font-black text-[#0B1220]">
                Workflow not found
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                This workflow request does not exist in the mock workflow dataset.
              </p>
              <Link
                href="/workflows"
                className="mt-5 inline-flex rounded-md bg-navy-800 px-4 py-2 text-sm font-bold text-white"
              >
                Back to workflows
              </Link>
            </Card>
          </div>
        )}
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      {(session) => <Body session={session} workflowId={params.workflowId} />}
    </AdminShell>
  );
}

function Body({ session, workflowId }: { session: AdminSession; workflowId: string }) {
  const workflow = getWorkflowRequest(workflowId);

  if (!workflow) return null;

  const nextPreview = getNextWorkflowPreview(workflow);
  const canActAtCurrentStage = canRoleActAtStage(session.role, workflow.requiredApproverRole);
  const isClosed = workflow.status === 'APPROVED' || workflow.status === 'REJECTED' || workflow.status === 'CANCELLED';

  return (
    <>
      <PageHeader
        eyebrow="Operations · Workflow detail"
        title={workflow.title}
        description={workflow.description}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Workflows', href: '/workflows' },
          { label: workflow.workflowId },
        ]}
        rightSlot={
          <Link
            href="/workflows"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to workflows
          </Link>
        }
      />

      <div className="mx-auto grid max-w-[1300px] grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
                  Workflow request
                </p>
                <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.04em] text-[#0B1220]">
                  {workflow.targetRecordLabel}
                </h2>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  {workflowTypeLabel(workflow.requestType)}
                </p>
              </div>

              <StatusPill tone={workflowStatusTone(workflow.status)}>
                {workflowStatusLabel(workflow.status)}
              </StatusPill>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
              <InfoBlock label="Current stage" value={workflowStageLabel(workflow.currentStage)} />
              <InfoBlock
                label="Required approver"
                value={workflow.requiredApproverRole ? roleLabel(workflow.requiredApproverRole) : 'None'}
              />
              <InfoBlock label="Initiator" value={workflow.initiatorName} />
              <InfoBlock label="Initiator role" value={roleLabel(workflow.initiatorRole)} />
              <InfoBlock label="Created at" value={formatDate(workflow.createdAt)} />
              <InfoBlock label="Updated at" value={formatDate(workflow.updatedAt)} />
            </div>

            {workflow.rejectionReason && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-red-700">
                  Rejection reason
                </p>
                <p className="mt-2 text-sm leading-relaxed text-red-800">
                  {workflow.rejectionReason}
                </p>
              </div>
            )}
          </Card>

          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-2">
              <History className="h-5 w-5 text-navy-700" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
                  Approval history
                </p>
                <h2 className="font-display text-xl font-black tracking-[-0.03em] text-[#0B1220]">
                  Timeline
                </h2>
              </div>
            </div>

            <div className="space-y-3">
              {workflow.approvalHistory.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-[#0B1220]">
                        {item.action} · {workflowStageLabel(item.stage)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.actorName} · {roleLabel(item.actorRole)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {item.comment}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-700">
              <GitPullRequestArrow className="h-6 w-6" />
            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
              Stage movement
            </p>

            <h3 className="mt-1 font-display text-xl font-black tracking-[-0.03em] text-[#0B1220]">
              Next action preview
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {nextPreview.message}
            </p>

            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <InfoLine label="Next stage" value={workflowStageLabel(nextPreview.nextStage)} />
              <InfoLine label="Next status" value={workflowStatusLabel(nextPreview.nextStatus)} />
              <InfoLine
                label="Next role"
                value={nextPreview.nextRequiredRole ? roleLabel(nextPreview.nextRequiredRole) : 'None'}
              />
            </div>

            {!canActAtCurrentStage && !isClosed && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
                <div className="flex gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    This workflow currently requires{' '}
                    <span className="font-bold">
                      {workflow.requiredApproverRole ? roleLabel(workflow.requiredApproverRole) : 'no approver'}
                    </span>
                    . You are signed in as <span className="font-bold">{roleLabel(session.role)}</span>.
                  </p>
                </div>
              </div>
            )}

            {isClosed ? (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                This workflow is closed. No approval action is available.
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-2">
                <GuardedActionButton
                  session={session}
                  action="APPROVE_WORKFLOW_STAGE"
                  variant="accent"
                  className="rounded-md font-black"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  hideWhenDenied={false}
                  onClick={() => {
                    createWorkflowStageNotification({
                        workflow,
                        action: 'APPROVED',
                        actorName: session.fullName,
                        actorRole: session.role,
                        nextRequiredRole: nextPreview.nextRequiredRole,
                    })
                  }}
                >
                  Approve stage
                </GuardedActionButton>

                <GuardedActionButton
                  session={session}
                  action="REJECT_WORKFLOW_STAGE"
                  variant="secondary"
                  className="rounded-md border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  icon={<XCircle className="h-4 w-4" />}
                  hideWhenDenied={false}
                  onClick={() => {
                    createWorkflowStageNotification({
                        workflow,
                        action: 'REJECTED',
                        actorName: session.fullName,
                        actorRole: session.role,
                        nextRequiredRole: null,
                    })
                  }}
                >
                  Reject request
                </GuardedActionButton>
              </div>
            )}
          </Card>

          <Card variant="default" className="rounded-3xl border-amber-200 bg-amber-50 p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-800">
              Frontend-only phase
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-900">
              These buttons model the approval process only. They do not persist changes yet.
              Backend workflow persistence, audit logs, and real notifications come later.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}

function canRoleActAtStage(role: AdminRole, requiredRole: AdminRole | null) {
  if (!requiredRole) return false;
  return role === requiredRole || role === 'SUPER_ADMIN';
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-[#0B1220]">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-2 last:border-b-0">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <span className="text-right text-xs font-black text-[#0B1220]">{value}</span>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}