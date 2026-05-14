'use client';

import { notFound } from 'next/navigation';
import { use, useState } from 'react';
import { CheckCircle2, FileText, MessageSquarePlus, XCircle } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';

export default function AgentApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AdminShell>
      {() => <Body id={id} />}
    </AdminShell>
  );
}

function Body({ id }: { id: string }) {
  const app = adminMock.getAgentApplication(id);
  if (!app) notFound();

  const [outcome, setOutcome] = useState<null | 'APPROVED' | 'REJECTED' | 'AWAITING_DOCS'>(null);
  const [note, setNote] = useState('');

  return (
    <>
      <PageHeader
        eyebrow="Agent KYC"
        title={app.fullName}
        description={`Submitted ${new Date(app.submittedAt).toLocaleDateString('en-NG', {
          day: '2-digit',
          month: 'short',
        })} · ${app.stateCode}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Agents', href: '/agents' },
          { label: 'Onboarding', href: '/agents/onboarding' },
          { label: app.applicationId },
        ]}
        rightSlot={<StatusPill tone={statusToTone(app.status)}>{app.status}</StatusPill>}
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard title="Documents submitted" padded={false}>
            <ul className="divide-y divide-slate-100">
              {app.docsSubmitted.map((label) => (
                <li
                  key={label}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#A8E368]/30 text-[#4E8F01]">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0B1220]">{label}</p>
                      <p className="text-xs text-slate-500">
                        Auto-scanned, hashed for audit log.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-black uppercase tracking-[0.14em] text-[#4E8F01]"
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Applicant">
            <Field label="Full name">{app.fullName}</Field>
            <Field label="Phone">{app.phoneE164}</Field>
            <Field label="State">{app.stateCode}</Field>
            <Field label="BVN ····">•••{app.bvnHashLastFour}</Field>
            <Field label="Reviewer">{app.reviewer ?? 'Unassigned'}</Field>
          </SectionCard>
        </div>

        <SectionCard
          title="Decision"
          description="Choose an outcome. The applicant receives an SMS within 30 minutes."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <DecisionTile
              tone="success"
              label="Approve"
              icon={<CheckCircle2 className="h-4 w-4" />}
              active={outcome === 'APPROVED'}
              onClick={() => setOutcome('APPROVED')}
            />
            <DecisionTile
              tone="warning"
              label="Request more docs"
              icon={<MessageSquarePlus className="h-4 w-4" />}
              active={outcome === 'AWAITING_DOCS'}
              onClick={() => setOutcome('AWAITING_DOCS')}
            />
            <DecisionTile
              tone="danger"
              label="Reject"
              icon={<XCircle className="h-4 w-4" />}
              active={outcome === 'REJECTED'}
              onClick={() => setOutcome('REJECTED')}
            />
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Reason / SMS message to send (will be templated)…"
            className="mt-3 w-full rounded-md border border-slate-200 p-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
          />

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="secondary" className="rounded-md border-slate-200 bg-white">
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!outcome || !note.trim()}
              className="rounded-md !border-transparent bg-[#4E8F01] font-black text-white hover:!border-transparent hover:bg-[#3a6a01] disabled:!bg-slate-200 disabled:text-slate-500"
            >
              <CheckCircle2 className="h-4 w-4" />
              Submit decision
            </Button>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold text-[#0B1220]">{children}</p>
    </div>
  );
}

function DecisionTile({
  tone,
  label,
  icon,
  active,
  onClick,
}: {
  tone: 'success' | 'warning' | 'danger';
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const tones = {
    success: active
      ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
      : 'border-slate-200 bg-white text-slate-700',
    warning: active
      ? 'border-amber-500 bg-amber-50 text-amber-900'
      : 'border-slate-200 bg-white text-slate-700',
    danger: active
      ? 'border-red-500 bg-red-50 text-red-900'
      : 'border-slate-200 bg-white text-slate-700',
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-md border-2 p-3 text-sm font-black ${tones[tone]}`}
    >
      {icon}
      {label}
    </button>
  );
}
