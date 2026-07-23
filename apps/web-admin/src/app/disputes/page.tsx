'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { AdminDisputeRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/api';

const STATUS_FILTERS = ['', 'OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'REJECTED'];

const CATEGORIES = [
  { value: 'PAYMENT_NO_TICKET', label: 'Debited, no ticket' },
  { value: 'PRIZE_NOT_RECEIVED', label: 'Prize not received' },
  { value: 'AGENT_CASH_ISSUE', label: 'Agent cash issue' },
  { value: 'RESULT_CONTESTED', label: 'Result contested' },
  { value: 'ACCOUNT_ACCESS', label: 'Account access' },
  { value: 'OTHER', label: 'Other' },
];

function statusTone(s: string) {
  return s === 'OPEN'
    ? 'warning'
    : s === 'UNDER_REVIEW'
      ? 'info'
      : s === 'ESCALATED'
        ? 'danger'
        : s === 'RESOLVED'
          ? 'success'
          : 'neutral';
}

export default function DisputesPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [status, setStatus] = useState('');
  const [phone, setPhone] = useState('');
  const [rows, setRows] = useState<AdminDisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = () => {
    setLoading(true);
    api.admin
      .listDisputes({ status: status || undefined, customerPhone: phone.trim() || undefined })
      .then((res) => setRows(res.disputes))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load disputes.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Disputes"
        description="Customer grievances and internal flags, tracked from open to resolution."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Disputes' }]}
        rightSlot={
          <button
            type="button"
            onClick={() => setShowNew((s) => !s)}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-black text-accent-foreground shadow-sm hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" />
            Log dispute
          </button>
        }
      />

      <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-5">
        {showNew && <NewDisputeForm onDone={() => { setShowNew(false); load(); }} onError={setError} />}

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatus(f)}
                className={
                  status === f
                    ? 'rounded-sm bg-[#0B1220] px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white'
                    : 'rounded-sm px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-500 hover:bg-slate-50'
                }
              >
                {f ? f.replace(/_/g, ' ') : 'All'}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="Filter by phone"
              className="h-9 w-48 rounded-md border border-slate-200 bg-white pl-9 pr-3 font-mono text-xs outline-none focus:border-navy-700"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : (
          <SectionCard title={`${rows.length} dispute${rows.length === 1 ? '' : 's'}`} padded={false}>
            <table className="min-w-full text-sm">
              <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Ref</th>
                  <th className="px-4 py-2 text-left">Category</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Subject</th>
                  <th className="px-4 py-2 text-left">Raised by</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                      No disputes match these filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((d) => (
                    <tr key={d.disputeId}>
                      <td className="px-4 py-3">
                        <Link href={`/disputes/${d.disputeId}`} className="font-mono text-xs font-black text-navy-700 hover:underline">
                          {d.disputeRef}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs">{d.category.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 font-mono text-xs">{d.customerPhone}</td>
                      <td className="max-w-[280px] truncate px-4 py-3 text-xs text-slate-600" title={d.subject}>
                        {d.subject}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{d.raisedByType}</td>
                      <td className="px-4 py-3">
                        <StatusPill tone={statusTone(d.status)}>{d.status.replace(/_/g, ' ')}</StatusPill>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500">
                        {Math.max(0, Math.round((Date.now() - new Date(d.createdAt).getTime()) / 86_400_000))}d
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </SectionCard>
        )}
      </div>
    </>
  );
}

function NewDisputeForm({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const [category, setCategory] = useState('PAYMENT_NO_TICKET');
  const [customerPhone, setCustomerPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [ticketRef, setTicketRef] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (customerPhone.trim().length < 6 || subject.trim().length < 4) {
      onError('Customer phone and a subject (4+ chars) are required.');
      return;
    }
    setBusy(true);
    try {
      await api.admin.createDispute({
        category,
        subject: subject.trim(),
        customerPhone: customerPhone.trim(),
        ...(ticketRef.trim() ? { ticketRef: ticketRef.trim().toUpperCase() } : {}),
      });
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not log dispute.');
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Log a dispute" description="Record a customer's complaint or an internal flag.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">Customer phone</label>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+234…"
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:border-navy-700"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">What happened</label>
          <textarea
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            rows={3}
            placeholder="In the customer's words…"
            className="w-full rounded-md border border-slate-200 bg-white p-3 text-sm outline-none focus:border-navy-700"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">Related ticket (optional)</label>
          <input
            value={ticketRef}
            onChange={(e) => setTicketRef(e.target.value)}
            placeholder="SW-…"
            className="h-11 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:border-navy-700"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[#0B1220] px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300"
        >
          {busy ? 'Logging…' : 'Log dispute'}
        </button>
      </form>
    </SectionCard>
  );
}