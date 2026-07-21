'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Pencil, ShieldCheck, XCircle } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminDrawTemplate } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import {
  canPerformAdminAction,
  type AdminSession,
} from '@/lib/admin-auth';
import { api } from '@/lib/api';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function hhmm(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export default function DrawSchedulePage() {
  return (
    <AdminShell>
      {(session) => <Body session={session} />}
    </AdminShell>
  );
}

function Body({ session }: { session: AdminSession }) {
  const [templates, setTemplates] = useState<AdminDrawTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminDrawTemplate | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = () => {
    setLoading(true);
    api.admin
      .listDrawTemplates()
      .then((res) => setTemplates(res.templates))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load templates.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const active = templates.filter((t) => t.status === 'ACTIVE');
  const pending = templates.filter((t) => t.status === 'PENDING_APPROVAL');
  const history = templates.filter(
    (t) => t.status === 'SUPERSEDED' || t.status === 'REJECTED',
  );

  const approve = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await api.admin.approveDrawTemplate(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed.');
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: string) => {
    if (rejectNote.trim().length < 4) return;
    setBusy(id);
    try {
      await api.admin.rejectDrawTemplate(id, rejectNote.trim());
      setRejectingId(null);
      setRejectNote('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rejection failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Draws · Schedule"
        title="Recurring draw configuration"
        description="Prices, prizes, and timings for auto-created draws. Changes are versioned and require a second admin's approval."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: 'Schedule' },
        ]}
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : (
          <>
            {pending.length > 0 && (
              <SectionCard
                title="Awaiting approval"
                description="A second admin must approve. The proposer cannot approve their own change."
              >
                <div className="space-y-3">
                  {pending.map((t) => (
                    <div key={t.templateId} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-[#0B1220]">
                            {t.label} · v{t.version}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {formatNaira(t.ticketPriceNgn)} ticket · {formatNaira(t.prizeValueNgn)} prize ·{' '}
                            {hhmm(t.cutoffMinutesWat)} cutoff / {hhmm(t.scheduledMinutesWat)} draw
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {t.weekdays.map((d) => DAY_LABELS[d]).join(', ')}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <GuardedActionButton
                            session={session}
                            action="APPROVE_DRAW_SETUP"
                            icon={<CheckCircle2 className="h-4 w-4" />}
                            onClick={() => approve(t.templateId)}
                            className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            {busy === t.templateId ? 'Working…' : 'Approve'}
                          </GuardedActionButton>

                          <button
                            type="button"
                            onClick={() => {
                              setRejectingId(t.templateId);
                              setRejectNote('');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </button>
                        </div>
                      </div>

                      {rejectingId === t.templateId && (
                        <div className="mt-3 border-t border-amber-200 pt-3">
                          <textarea
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            rows={2}
                            placeholder="Why is this change rejected?"
                            className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm outline-none focus:border-navy-700"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={rejectNote.trim().length < 4 || busy === t.templateId}
                              onClick={() => reject(t.templateId)}
                              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-black text-white disabled:bg-slate-300"
                            >
                              Confirm rejection
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectingId(null)}
                              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {active.map((t) => (
                <SectionCard
                  key={t.templateId}
                  title={t.label}
                  description={`Version ${t.version} · in force since ${new Date(t.effectiveFrom).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                  rightSlot={<StatusPill tone="success">ACTIVE</StatusPill>}
                >
                  <Row label="Ticket price">{formatNaira(t.ticketPriceNgn)}</Row>
                  <Row label="Prize">{`${t.prizeDescription} · ${formatNaira(t.prizeValueNgn)}`}</Row>
                  <Row label="Sales cutoff">{hhmm(t.cutoffMinutesWat)} WAT</Row>
                  <Row label="Draw runs">{hhmm(t.scheduledMinutesWat)} WAT</Row>
                  <Row label="Days">{t.weekdays.map((d) => DAY_LABELS[d]).join(', ')}</Row>
                  <Row label="Quota">{t.ticketQuota ? t.ticketQuota.toLocaleString('en-NG') : 'Unlimited'}</Row>

                  {canPerformAdminAction(session.tier, 'CREATE_DRAW_SETUP_REQUEST') && (
                    <button
                      type="button"
                      onClick={() => setEditing(t)}
                      className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
                    >
                      <Pencil className="h-4 w-4" />
                      Propose change
                    </button>
                  )}
                </SectionCard>
              ))}
            </div>

            {editing && (
              <ProposeForm
                base={editing}
                onCancel={() => setEditing(null)}
                onDone={() => {
                  setEditing(null);
                  load();
                }}
                onError={setError}
              />
            )}

            {history.length > 0 && (
              <SectionCard title="Version history" padded={false}>
                <table className="min-w-full text-sm">
                  <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Template</th>
                      <th className="px-4 py-2 text-right">Ver</th>
                      <th className="px-4 py-2 text-right">Ticket</th>
                      <th className="px-4 py-2 text-left">Window</th>
                      <th className="px-4 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((t) => (
                      <tr key={t.templateId}>
                        <td className="px-4 py-2">{t.label}</td>
                        <td className="px-4 py-2 text-right tabular-nums">v{t.version}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNaira(t.ticketPriceNgn)}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {new Date(t.effectiveFrom).toLocaleDateString('en-NG', {
                            day: '2-digit',
                            month: 'short',
                          })}
                          {t.effectiveTo
                            ? ` → ${new Date(t.effectiveTo).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}`
                            : ''}
                        </td>
                        <td className="px-4 py-2">
                          <StatusPill tone={t.status === 'REJECTED' ? 'danger' : 'neutral'}>
                            {t.status}
                          </StatusPill>
                          {t.rejectionNote && (
                            <p className="mt-1 text-xs text-slate-500">{t.rejectionNote}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SectionCard>
            )}

            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
              <p className="text-xs leading-relaxed text-slate-600">
                Config is versioned: an approved change supersedes the previous version rather than
                overwriting it, so every price and timing in force at any past date remains on
                record. The scheduler picks up an approved change on its next pass — no redeploy.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ProposeForm({
  base,
  onCancel,
  onDone,
  onError,
}: {
  base: AdminDrawTemplate;
  onCancel: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [label, setLabel] = useState(base.label);
  const [prizeDescription, setPrizeDescription] = useState(base.prizeDescription);
  const [prizeValueNgn, setPrizeValueNgn] = useState(base.prizeValueNgn);
  const [ticketPriceNgn, setTicketPriceNgn] = useState(base.ticketPriceNgn);
  const [cutoff, setCutoff] = useState(hhmm(base.cutoffMinutesWat));
  const [scheduled, setScheduled] = useState(hhmm(base.scheduledMinutesWat));
  const [weekdays, setWeekdays] = useState<number[]>(base.weekdays);
  const [submitting, setSubmitting] = useState(false);

  const toMinutes = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };

  const submit = async () => {
    if (weekdays.length === 0) {
      onError('Pick at least one day.');
      return;
    }
    if (toMinutes(cutoff) >= toMinutes(scheduled)) {
      onError('Cutoff must be earlier in the day than the draw time.');
      return;
    }
    setSubmitting(true);
    try {
      await api.admin.proposeDrawTemplate({
        templateType: base.templateType,
        label,
        prizeDescription,
        prizeValueNgn,
        ticketPriceNgn,
        cutoffMinutesWat: toMinutes(cutoff),
        scheduledMinutesWat: toMinutes(scheduled),
        weekdays: [...weekdays].sort((a, b) => a - b),
        ...(base.ticketQuota ? { ticketQuota: base.ticketQuota } : {}),
      });
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not propose change.');
      setSubmitting(false);
    }
  };

  return (
    <SectionCard
      title={`Propose change — ${base.label}`}
      description={`Creates version ${base.version + 1}, awaiting another admin's approval.`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Label">
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Prize description">
            <input
              value={prizeDescription}
              onChange={(e) => setPrizeDescription(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Ticket price (₦)" hint={formatNaira(ticketPriceNgn)}>
            <input
              type="number"
              min={1}
              value={ticketPriceNgn}
              onChange={(e) => setTicketPriceNgn(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="Prize value (₦)" hint={formatNaira(prizeValueNgn)}>
            <input
              type="number"
              min={1}
              value={prizeValueNgn}
              onChange={(e) => setPrizeValueNgn(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="Sales cutoff (WAT)">
            <input type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Draw time (WAT)">
            <input
              type="time"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-bold text-[#0B1220]">Days</p>
          <div className="flex flex-wrap gap-1">
            {DAY_LABELS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))
                }
                className={
                  weekdays.includes(i)
                    ? 'rounded-md bg-[#0B1220] px-3 py-1.5 text-xs font-black text-white'
                    : 'rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500'
                }
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-md bg-[#0B1220] px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300"
          >
            <Clock className="h-4 w-4" />
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

const inputCls =
  'h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-[#0B1220]">{children}</span>
    </div>
  );
}