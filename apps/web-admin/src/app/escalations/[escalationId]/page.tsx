'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  FlagTriangleRight,
  MessageSquareText,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Card } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import type { AdminSession } from '@/lib/admin-auth';
import { roleLabel } from '@/lib/admin-auth';
import {
  escalationModuleLabel,
  escalationSeverityTone,
  escalationStatusLabel,
  escalationStatusTone,
  getAuditorEscalation,
} from '@/lib/escalations-mock';

export default function EscalationDetailPage() {
  const params = useParams<{ escalationId: string }>();
  const escalation = getAuditorEscalation(params.escalationId);

  if (!escalation) {
    return (
      <AdminShell>
        {() => (
          <div className="mx-auto max-w-[720px] px-6 py-16">
            <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-8 text-center shadow-sm">
              <h1 className="font-display text-3xl font-black text-[#0B1220]">
                Escalation not found
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                This escalation does not exist in the mock dataset.
              </p>
              <Link
                href="/escalations"
                className="mt-5 inline-flex rounded-md bg-navy-800 px-4 py-2 text-sm font-bold text-white"
              >
                Back to escalations
              </Link>
            </Card>
          </div>
        )}
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      {(session) => <Body session={session} escalationId={params.escalationId} />}
    </AdminShell>
  );
}

function Body({
  session,
  escalationId,
}: {
  session: AdminSession;
  escalationId: string;
}) {
  const escalation = getAuditorEscalation(escalationId);
  if (!escalation) return null;

  return (
    <>
      <PageHeader
        eyebrow="Compliance · Escalation detail"
        title={escalation.title}
        description="Management review channel separate from normal approval workflow."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Escalations', href: '/escalations' },
          { label: escalation.escalationId },
        ]}
        rightSlot={
          <Link
            href="/escalations"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to escalations
          </Link>
        }
      />

      <div className="mx-auto grid max-w-[1300px] grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
                  Escalation issue
                </p>
                <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.04em] text-[#0B1220]">
                  {escalation.title}
                </h2>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  {escalation.relatedRecord}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusPill tone={escalationSeverityTone(escalation.severity)}>
                  {escalation.severity}
                </StatusPill>
                <StatusPill tone={escalationStatusTone(escalation.status)}>
                  {escalationStatusLabel(escalation.status)}
                </StatusPill>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
              <InfoBlock label="Module" value={escalationModuleLabel(escalation.module)} />
              <InfoBlock label="Assigned to" value={escalation.assignedTo} />
              <InfoBlock label="Raised by" value={escalation.raisedByName} />
              <InfoBlock label="Raised role" value={roleLabel(escalation.raisedByRole)} />
              <InfoBlock label="Raised at" value={formatDate(escalation.raisedAt)} />
              <InfoBlock label="Escalation ID" value={escalation.escalationId} mono />
            </div>
          </Card>

          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-navy-700" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
                  Evidence / comment
                </p>
                <h3 className="font-display text-xl font-black tracking-[-0.03em] text-[#0B1220]">
                  Auditor observation
                </h3>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-600">
              {escalation.evidenceComment}
            </p>
          </Card>

          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-navy-700" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
                  Management response
                </p>
                <h3 className="font-display text-xl font-black tracking-[-0.03em] text-[#0B1220]">
                  Response record
                </h3>
              </div>
            </div>

            {escalation.managementResponse ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm leading-relaxed text-emerald-900">
                  {escalation.managementResponse}
                </p>
                <p className="mt-3 text-xs font-semibold text-emerald-800">
                  Responded by {escalation.respondedBy} ·{' '}
                  {escalation.respondedAt ? formatDate(escalation.respondedAt) : 'No date'}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                No management response recorded yet.
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-700">
              <FlagTriangleRight className="h-6 w-6" />
            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
              Management controls
            </p>
            <h3 className="mt-1 font-display text-xl font-black tracking-[-0.03em] text-[#0B1220]">
              Respond to escalation
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Only management/Super Admin should respond. Auditor can raise and monitor,
              but cannot close the escalation.
            </p>

            <textarea
              className="mt-4 min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-[#0B1220] outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              placeholder="Management response / resolution note..."
            />

            <div className="mt-4 grid grid-cols-1 gap-2">
              <GuardedActionButton
                session={session}
                action="RESPOND_TO_ESCALATION"
                variant="accent"
                className="rounded-md font-black"
                icon={<CheckCircle2 className="h-4 w-4" />}
                audit={{
                  module: 'AUDIT',
                  action: 'CONFIG_CHANGE_REQUESTED',
                  target: escalation.title,
                  oldValue: escalationStatusLabel(escalation.status),
                  newValue: 'Management response submitted',
                  reason: 'Management responded to auditor escalation from frontend mock detail page',
                }}
              >
                Submit response
              </GuardedActionButton>

              <GuardedActionButton
                session={session}
                action="RESPOND_TO_ESCALATION"
                variant="secondary"
                className="rounded-md border-slate-200 bg-white text-[#0B1220]"
                icon={<XCircle className="h-4 w-4" />}
                audit={{
                  module: 'AUDIT',
                  action: 'CONFIG_CHANGE_REQUESTED',
                  target: escalation.title,
                  oldValue: escalationStatusLabel(escalation.status),
                  newValue: 'Escalation dismissed',
                  reason: 'Management dismissed auditor escalation from frontend mock detail page',
                }}
              >
                Dismiss escalation
              </GuardedActionButton>
            </div>
          </Card>

          <Card variant="default" className="rounded-3xl border-violet-200 bg-violet-50 p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-800">
              Role rule
            </p>
            <p className="mt-2 text-sm leading-relaxed text-violet-900">
              You are signed in as <span className="font-bold">{roleLabel(session.tier)}</span>.
              Auditor can raise escalations but cannot respond, approve, reject, or close them.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}

function InfoBlock({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className={mono ? 'mt-1 font-mono text-sm font-bold text-[#0B1220]' : 'mt-1 text-sm font-bold text-[#0B1220]'}>
        {value}
      </p>
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