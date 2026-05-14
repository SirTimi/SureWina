'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { GitCommit, Save } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

export default function EditDrawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AdminShell>
      {() => <Body id={id} />}
    </AdminShell>
  );
}

function Body({ id }: { id: string }) {
  const router = useRouter();
  const draw = adminMock.getDraw(id);
  if (!draw) notFound();

  const [prize, setPrize] = useState(draw.prizeDescription);
  const [ticketCap, setTicketCap] = useState(String(draw.ticketCap));
  const [scheduledAt, setScheduledAt] = useState(draw.scheduledAt.slice(0, 16));
  const [cutoffAt, setCutoffAt] = useState(draw.cutoffAt.slice(0, 16));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 300));
    router.push(`/draws/${draw.drawCode}`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Draws"
        title={`Edit · ${draw.prizeDescription}`}
        description="Edits are versioned and require a change reason for the audit log."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: draw.drawCode, href: `/draws/${draw.drawCode}` },
          { label: 'Edit' },
        ]}
      />

      <div className="mx-auto max-w-[900px] space-y-4 px-6 py-5">
        <SectionCard title="Editable fields">
          <FormRow label="Prize description">
            <input
              value={prize}
              onChange={(e) => setPrize(e.target.value)}
              className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
            />
          </FormRow>
          <FormRow label="Ticket cap">
            <input
              inputMode="numeric"
              value={ticketCap}
              onChange={(e) => setTicketCap(e.target.value.replace(/\D/g, ''))}
              className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
            />
          </FormRow>
          <FormRow label="Cutoff">
            <input
              type="datetime-local"
              value={cutoffAt}
              onChange={(e) => setCutoffAt(e.target.value)}
              className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
            />
          </FormRow>
          <FormRow label="Scheduled execution">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
            />
          </FormRow>
        </SectionCard>

        <SectionCard title="Change reason · required for audit log">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this change being made?"
            className="w-full rounded-md border border-slate-200 p-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
          />
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
            <GitCommit className="h-3 w-3" /> Saved as a new version with this note.
          </p>
        </SectionCard>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-slate-500">
            Saving creates version{' '}
            <span className="font-mono font-black">{Math.floor(Math.random() * 5) + 2}</span>{' '}
            of this draw config.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => router.back()}
              className="rounded-md border-slate-200 bg-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={save}
              isLoading={saving}
              disabled={!reason.trim()}
              variant="accent"
              className="rounded-md !border-transparent bg-[#4E8F01] font-black text-white hover:!border-transparent hover:bg-[#3a6a01] disabled:!bg-slate-200 disabled:text-slate-500"
            >
              <Save className="h-4 w-4" />
              Save new version
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
