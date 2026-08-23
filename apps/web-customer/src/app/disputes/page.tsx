'use client';
export const dynamic = 'force-dynamic';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import type { CustomerDisputeRow } from '@surewina/api-client';
import { api } from '@/lib/api';
import { isSignedIn } from '@/lib/auth';

const CATEGORIES = [
  { value: 'PAYMENT_NO_TICKET', label: 'I paid but got no ticket' },
  { value: 'PRIZE_NOT_RECEIVED', label: "I won but haven't received my prize" },
  { value: 'AGENT_CASH_ISSUE', label: 'Problem with an agent payment' },
  { value: 'RESULT_CONTESTED', label: 'I disagree with a draw result' },
  { value: 'ACCOUNT_ACCESS', label: "I can't access my account or claim" },
  { value: 'OTHER', label: 'Something else' },
];

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  OPEN: { text: 'Received', cls: 'bg-amber-100 text-amber-800' },
  UNDER_REVIEW: { text: 'Under review', cls: 'bg-blue-100 text-blue-800' },
  ESCALATED: { text: 'Escalated', cls: 'bg-orange-100 text-orange-800' },
  RESOLVED: { text: 'Resolved', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { text: 'Closed', cls: 'bg-slate-100 text-slate-600' },
};

export default function CustomerDisputesPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [rows, setRows] = useState<CustomerDisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.claims
      .listDisputes()
      .then((res) => setRows(res.disputes))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your reports.'))
      .finally(() => setLoading(false));
  };

  // localStorage isn't available during SSR, so the check runs after mount.
  useEffect(() => {
    const ok = isSignedIn();
    setSignedIn(ok);
    if (ok) load();
    else setLoading(false);
  }, []);

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black text-[#0B1220]">Report a problem</h1>
        <p className="mt-2 text-slate-600">Sign in to report an issue and track it.</p>
        <Link href="/sign-in" className="mt-4 inline-block rounded-lg bg-[#0B1220] px-6 py-3 font-black text-white">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0B1220]">Your reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Problems you&apos;ve reported and where they stand.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-black text-[#0B1220] hover:bg-amber-300"
        >
          {showForm ? 'Close' : 'Report a problem'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {showForm && <RaiseForm onDone={() => { setShowForm(false); load(); }} onError={setError} />}

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            You haven&apos;t reported any problems. If something&apos;s wrong, tap
            &quot;Report a problem&quot;.
          </div>
        ) : (
          rows.map((d) => {
            const s = STATUS_LABEL[d.status] ?? { text: d.status, cls: 'bg-slate-100 text-slate-600' };
            return (
              <div key={d.disputeRef} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs font-black text-slate-500">{d.disputeRef}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${s.cls}`}>
                    {s.text}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#0B1220]">{d.subject}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Reported {new Date(d.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
                {d.resolutionNote && (
                  <div className="mt-3 rounded-lg bg-emerald-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Our response</p>
                    <p className="mt-0.5 text-sm text-emerald-900">{d.resolutionNote}</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RaiseForm({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const [category, setCategory] = useState('PAYMENT_NO_TICKET');
  const [subject, setSubject] = useState('');
  const [ticketRef, setTicketRef] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 10) {
      onError('Please describe the problem in a little more detail (10+ characters).');
      return;
    }
    setBusy(true);
    try {
      await api.claims.raiseDispute({
        category,
        subject: subject.trim(),
        ...(ticketRef.trim() ? { ticketRef: ticketRef.trim().toUpperCase() } : {}),
      });
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not send your report.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">
          What&apos;s the problem?
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0B1220]"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">Tell us what happened</label>
        <textarea
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          rows={4}
          placeholder="Describe the problem in your own words…"
          className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-[#0B1220]"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">Ticket number (if it helps)</label>
        <input
          value={ticketRef}
          onChange={(e) => setTicketRef(e.target.value)}
          placeholder="SW-…"
          className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:border-[#0B1220]"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-[#0B1220] px-6 py-3 font-black text-white disabled:bg-slate-300"
      >
        {busy ? 'Sending…' : 'Send report'}
      </button>
    </form>
  );
}