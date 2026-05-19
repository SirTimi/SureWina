'use client';

import { notFound } from 'next/navigation';
import { use, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, MessageSquarePlus, XCircle } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';

export default function KycCaseDetailPage({
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
  const kyc = adminMock.getKycCase(id);
  if (!kyc) notFound();

  const [decision, setDecision] = useState<null | 'PASSED' | 'AWAITING_DOCS' | 'REJECTED'>(null);
  const [note, setNote] = useState('');

  return (
    <>
      <PageHeader
        eyebrow="KYC · Manual review"
        title={`Case ${kyc.kycCaseId}`}
        description={`${kyc.customerPhoneE164} · ${kyc.level}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'KYC review', href: '/kyc/review' },
          { label: kyc.kycCaseId },
        ]}
        rightSlot={<StatusPill tone={statusToTone(kyc.status)}>{kyc.status}</StatusPill>}
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        {kyc.flags.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <ul className="text-sm font-medium">
              {kyc.flags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <SectionCard title="Documents" padded={false}>
            <ul className="divide-y divide-slate-100">
              {kyc.docs.map((d) => (
                <li
                  key={d.label}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy-50 text-navy-700">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#1A1816]">{d.label}</p>
                      <p className="text-xs text-slate-500">
                        Uploaded{' '}
                        {new Date(d.uploadedAt).toLocaleDateString('en-NG', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-black uppercase tracking-[0.14em] text-navy-700"
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Case details">
            <Field label="Phone">{kyc.customerPhoneE164}</Field>
            <Field label="Tier level">{kyc.level}</Field>
            <Field label="Submitted">
              {new Date(kyc.submittedAt).toLocaleDateString('en-NG')}
            </Field>
            <Field label="Linked claim">{kyc.claimId ?? '—'}</Field>
            <Field label="Reviewer">{kyc.reviewer ?? 'Unassigned'}</Field>
          </SectionCard>
        </div>

        <SectionCard title="Decision">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Tile
              tone="success"
              active={decision === 'PASSED'}
              onClick={() => setDecision('PASSED')}
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Pass"
            />
            <Tile
              tone="warning"
              active={decision === 'AWAITING_DOCS'}
              onClick={() => setDecision('AWAITING_DOCS')}
              icon={<MessageSquarePlus className="h-4 w-4" />}
              label="Request docs"
            />
            <Tile
              tone="danger"
              active={decision === 'REJECTED'}
              onClick={() => setDecision('REJECTED')}
              icon={<XCircle className="h-4 w-4" />}
              label="Reject"
            />
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Internal note + SMS to customer…"
            className="mt-3 w-full rounded-md border border-slate-200 p-3 text-sm font-medium outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
          />

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="accent"
              disabled={!decision || !note.trim()}
              className="rounded-md !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-900 disabled:!bg-slate-200 disabled:text-slate-500"
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
      <p className="mt-0.5 text-sm font-bold text-[#1A1816]">{children}</p>
    </div>
  );
}

function Tile({
  tone,
  active,
  onClick,
  icon,
  label,
}: {
  tone: 'success' | 'warning' | 'danger';
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
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
