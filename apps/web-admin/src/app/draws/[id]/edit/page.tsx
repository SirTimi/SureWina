'use client';

import { FormEvent, use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Save } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminDrawDetail } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import {
  canPerformAdminAction,
  getAdminActionDeniedReason,
  type AdminSession,
} from '@/lib/admin-auth';
import { api } from '@/lib/api';

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditDrawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AdminShell>
      {(session) => <Body id={id} session={session} />}
    </AdminShell>
  );
}

function Body({ id, session }: { id: string; session: AdminSession }) {
  const router = useRouter();
  const [original, setOriginal] = useState<AdminDrawDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [prizeDescription, setPrizeDescription] = useState('');
  const [prizeValueNgn, setPrizeValueNgn] = useState(0);
  const [ticketPriceNgn, setTicketPriceNgn] = useState(0);
  const [ticketQuota, setTicketQuota] = useState('');
  const [prizeImageUrl, setPrizeImageUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [cutoffAt, setCutoffAt] = useState('');

  const allowed = canPerformAdminAction(session.tier, 'CREATE_DRAW_SETUP_REQUEST');

  useEffect(() => {
    api.admin
      .drawDetail(id)
      .then((d) => {
        setOriginal(d);
        setPrizeDescription(d.draw.prizeDescription);
        setPrizeValueNgn(d.draw.prizeValueNgn);
        setTicketPriceNgn(d.draw.ticketPriceNgn);
        setTicketQuota(d.draw.ticketQuota ? String(d.draw.ticketQuota) : '');
        setPrizeImageUrl(d.draw.prizeImageUrl ?? '');
        setScheduledAt(toLocalInput(d.draw.scheduledAt));
        setCutoffAt(toLocalInput(d.draw.cutoffAt));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load draw.'))
      .finally(() => setLoading(false));
  }, [id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!original) return;
    setError(null);

    const scheduled = new Date(scheduledAt);
    const cutoff = new Date(cutoffAt);

    if (prizeDescription.trim().length < 3) {
      setError('Prize description must be at least 3 characters.');
      return;
    }
    if (cutoff.getTime() >= scheduled.getTime()) {
      setError('Sales cutoff must be before the draw time.');
      return;
    }

    // Only send changed fields — the DTO is fully optional.
    const patch: Record<string, unknown> = {};
    if (prizeDescription.trim() !== original.draw.prizeDescription)
      patch.prizeDescription = prizeDescription.trim();
    if (prizeValueNgn !== original.draw.prizeValueNgn) patch.prizeValueNgn = prizeValueNgn;
    if (ticketPriceNgn !== original.draw.ticketPriceNgn) patch.ticketPriceNgn = ticketPriceNgn;
    if ((ticketQuota ? Number(ticketQuota) : null) !== original.draw.ticketQuota && ticketQuota)
      patch.ticketQuota = Number(ticketQuota);
    if (prizeImageUrl.trim() && prizeImageUrl.trim() !== original.draw.prizeImageUrl)
      patch.prizeImageUrl = prizeImageUrl.trim();
    if (scheduled.toISOString() !== original.draw.scheduledAt)
      patch.scheduledAt = scheduled.toISOString();
    if (cutoff.toISOString() !== original.draw.cutoffAt) patch.cutoffAt = cutoff.toISOString();

    if (Object.keys(patch).length === 0) {
      router.push(`/draws/${id}`);
      return;
    }

    setSubmitting(true);
    try {
      await api.admin.updateDraw(id, patch);
      router.push(`/draws/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-8">
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      </div>
    );
  }

  if (!original) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {error ?? 'Draw not found.'}
        </div>
      </div>
    );
  }

  const notEditable = original.draw.status !== 'SCHEDULED';

  return (
    <>
      <PageHeader
        eyebrow="Draws"
        title={`Edit ${original.draw.drawCode}`}
        description="Only scheduled draws can be edited. Type is immutable once created."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: original.draw.drawCode, href: `/draws/${id}` },
          { label: 'Edit' },
        ]}
      />

      <div className="mx-auto max-w-[720px] px-6 py-5">
        {!allowed || notEditable ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
            <p className="mt-3 text-sm text-slate-700">
              {notEditable
                ? `This draw is ${original.draw.status} and can no longer be edited.`
                : getAdminActionDeniedReason(session.tier, 'CREATE_DRAW_SETUP_REQUEST')}
            </p>
            <Link
              href={`/draws/${id}`}
              className="mt-4 inline-block text-sm font-black text-navy-700 hover:underline"
            >
              Back to draw
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <SectionCard title="Draw details">
              <div className="space-y-4">
                <Field label="Prize description">
                  <input
                    value={prizeDescription}
                    onChange={(e) => setPrizeDescription(e.target.value)}
                    maxLength={200}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
                  />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Prize value (₦)" hint={formatNaira(prizeValueNgn)}>
                    <input
                      type="number"
                      min={1}
                      value={prizeValueNgn}
                      onChange={(e) => setPrizeValueNgn(Number(e.target.value))}
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:border-navy-700"
                    />
                  </Field>

                  <Field label="Ticket price (₦)" hint={formatNaira(ticketPriceNgn)}>
                    <input
                      type="number"
                      min={1}
                      value={ticketPriceNgn}
                      onChange={(e) => setTicketPriceNgn(Number(e.target.value))}
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:border-navy-700"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Sales cutoff">
                    <input
                      type="datetime-local"
                      value={cutoffAt}
                      onChange={(e) => setCutoffAt(e.target.value)}
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
                    />
                  </Field>

                  <Field label="Draw runs at">
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Ticket quota (optional)">
                    <input
                      type="number"
                      min={1}
                      value={ticketQuota}
                      onChange={(e) => setTicketQuota(e.target.value)}
                      placeholder="Unlimited"
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:border-navy-700"
                    />
                  </Field>

                  <Field label="Prize image URL (optional)">
                    <input
                      type="url"
                      value={prizeImageUrl}
                      onChange={(e) => setPrizeImageUrl(e.target.value)}
                      placeholder="https://…"
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
                    />
                  </Field>
                </div>

                {original.sales.ticketsSold > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <span className="font-black">
                      {original.sales.ticketsSold} ticket
                      {original.sales.ticketsSold === 1 ? '' : 's'} already sold.
                    </span>{' '}
                    Changing price or timing after sales have started affects buyers who already paid.
                  </div>
                )}

                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-md bg-[#0B1220] px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300"
                  >
                    <Save className="h-4 w-4" />
                    {submitting ? 'Saving…' : 'Save changes'}
                  </button>
                  <Link
                    href={`/draws/${id}`}
                    className="rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600"
                  >
                    Cancel
                  </Link>
                </div>
              </div>
            </SectionCard>
          </form>
        )}
      </div>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-slate-500">{hint}</span>}
      </label>
      {children}
    </div>
  );
}