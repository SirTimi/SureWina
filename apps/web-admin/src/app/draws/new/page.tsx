'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, Trophy } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { canPerformAdminAction, getAdminActionDeniedReason, type AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

type DrawType = 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';

export default function NewDrawPage() {
  return (
    <AdminShell>
      {(session) => <Body session={session} />}
    </AdminShell>
  );
}

function Body({ session }: { session: AdminSession }) {
  const router = useRouter();
  const [drawType, setDrawType] = useState<DrawType>('DAILY_STANDARD');
  const [prizeDescription, setPrizeDescription] = useState('');
  const [prizeValueNgn, setPrizeValueNgn] = useState(500000);
  const [ticketPriceNgn, setTicketPriceNgn] = useState(500);
  const [ticketQuota, setTicketQuota] = useState('');
  const [prizeImageUrl, setPrizeImageUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [cutoffAt, setCutoffAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = canPerformAdminAction(session.tier, 'CREATE_DRAW_SETUP_REQUEST');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (prizeDescription.trim().length < 3) {
      setError('Prize description must be at least 3 characters.');
      return;
    }
    if (!scheduledAt || !cutoffAt) {
      setError('Both cutoff and draw times are required.');
      return;
    }

    const scheduled = new Date(scheduledAt);
    const cutoff = new Date(cutoffAt);

    if (cutoff.getTime() >= scheduled.getTime()) {
      setError('Sales cutoff must be before the draw time.');
      return;
    }
    if (cutoff.getTime() <= Date.now()) {
      setError('Sales cutoff must be in the future.');
      return;
    }

    setSubmitting(true);
    try {
      await api.admin.createDraw({
        drawType,
        prizeDescription: prizeDescription.trim(),
        prizeValueNgn,
        ticketPriceNgn,
        scheduledAt: scheduled.toISOString(),
        cutoffAt: cutoff.toISOString(),
        ...(ticketQuota ? { ticketQuota: Number(ticketQuota) } : {}),
        ...(prizeImageUrl.trim() ? { prizeImageUrl: prizeImageUrl.trim() } : {}),
      });
      router.push('/draws');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create draw.');
      setSubmitting(false);
    }
  };

  if (!allowed) {
    return (
      <>
        <PageHeader
          eyebrow="Draws"
          title="New draw"
          breadcrumbs={[
            { label: 'Admin', href: '/' },
            { label: 'Draws', href: '/draws' },
            { label: 'New' },
          ]}
        />
        <div className="mx-auto max-w-[720px] px-6 py-10">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
            <p className="mt-3 text-sm text-slate-700">
              {getAdminActionDeniedReason(session.tier, 'CREATE_DRAW_SETUP_REQUEST')}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Draws"
        title="New draw"
        description="Manual draws sit alongside the auto-scheduled dailies and Saturday jackpot."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: 'New' },
        ]}
      />

      <div className="mx-auto max-w-[720px] px-6 py-5">
        <form onSubmit={submit}>
          <SectionCard title="Draw setup">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">Draw type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['DAILY_STANDARD', 'SATURDAY_JACKPOT'] as DrawType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setDrawType(t);
                        if (t === 'SATURDAY_JACKPOT') {
                          setPrizeValueNgn(4000000);
                          setTicketPriceNgn(5000);
                        } else {
                          setPrizeValueNgn(500000);
                          setTicketPriceNgn(500);
                        }
                      }}
                      className={
                        drawType === t
                          ? 'rounded-lg border-2 border-navy-700 bg-navy-50 p-3 text-left'
                          : 'rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-slate-300'
                      }
                    >
                      <span className="flex items-center gap-2 text-sm font-black text-[#0B1220]">
                        {t === 'SATURDAY_JACKPOT' && <Trophy className="h-4 w-4 text-amber-600" />}
                        {t === 'DAILY_STANDARD' ? 'Daily standard' : 'Saturday jackpot'}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {t === 'DAILY_STANDARD'
                          ? 'Regular draw, weekday pricing'
                          : 'Jackpot pricing and accumulation'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Prize description">
                <input
                  value={prizeDescription}
                  onChange={(e) => setPrizeDescription(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Samsung Galaxy A55 or ₦500,000 cash"
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
                <Field label="Sales cutoff" hint="Sales stop at this time">
                  <input
                    type="datetime-local"
                    value={cutoffAt}
                    onChange={(e) => setCutoffAt(e.target.value)}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
                  />
                </Field>

                <Field label="Draw runs at" hint="Engine executes at this time">
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Ticket quota (optional)" hint="Leave blank for unlimited">
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
                  <Plus className="h-4 w-4" />
                  {submitting ? 'Creating…' : 'Create draw'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/draws')}
                  className="rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </SectionCard>
        </form>
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
        {hint && <span className="ml-2 font-normal text-xs text-slate-500">{hint}</span>}
      </label>
      {children}
    </div>
  );
}