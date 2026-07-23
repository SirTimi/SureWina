'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { ArrowRight, CircleDot, MessageSquarePlus, Send } from 'lucide-react';
import type { AdminDisputeDetail } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/api';

// Mirrors the server-side ALLOWED map so the UI only offers legal moves.
const NEXT: Record<string, string[]> = {
  OPEN: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['ESCALATED', 'RESOLVED', 'REJECTED'],
  ESCALATED: ['UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
};

function statusTone(s: string) {
  return s === 'OPEN' ? 'warning' : s === 'UNDER_REVIEW' ? 'info' : s === 'ESCALATED' ? 'danger' : s === 'RESOLVED' ? 'success' : 'neutral';
}

export default function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdminShell>{() => <Body id={id} />}</AdminShell>;
}

function Body({ id }: { id: string }) {
  const [d, setD] = useState<AdminDisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [transitionTo, setTransitionTo] = useState<string | null>(null);
  const [transitionNote, setTransitionNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.admin
      .disputeDetail(id)
      .then(setD)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load dispute.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const addNote = async () => {
    if (note.trim().length < 2) return;
    setBusy(true);
    try {
      await api.admin.addDisputeNote(id, note.trim());
      setNote('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add note.');
    } finally {
      setBusy(false);
    }
  };

  const doTransition = async (to: string) => {
    const needsNote = to === 'RESOLVED' || to === 'REJECTED';
    if (needsNote && transitionNote.trim().length < 4) {
      setTransitionTo(to);
      return;
    }
    setBusy(true);
    try {
      await api.admin.transitionDispute(id, to, needsNote ? transitionNote.trim() : undefined);
      setTransitionTo(null);
      setTransitionNote('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transition failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-[1000px] px-6 py-8"><div className="h-64 animate-pulse rounded-xl bg-white" /></div>;
  }
  if (!d) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {error ?? 'Dispute not found.'}
        </div>
      </div>
    );
  }

  const nextStates = NEXT[d.status] ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Disputes"
        title={d.disputeRef}
        description={`${d.category.replace(/_/g, ' ')} · ${d.customerPhone}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Disputes', href: '/disputes' },
          { label: d.disputeRef },
        ]}
        rightSlot={<StatusPill tone={statusTone(d.status)}>{d.status.replace(/_/g, ' ')}</StatusPill>}
      />

      <div className="mx-auto max-w-[1000px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <SectionCard title="Complaint">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{d.subject}</p>
              {(d.links.ticketRef || d.links.paymentTxnId || d.links.claimId || d.links.agentCode) && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {d.links.ticketRef && <LinkChip label="Ticket" value={d.links.ticketRef} />}
                  {d.links.paymentTxnId && <LinkChip label="Payment" value={d.links.paymentTxnId} />}
                  {d.links.claimId && <LinkChip label="Claim" value={d.links.claimId} href={`/claims/${d.links.claimId}`} />}
                  {d.links.agentCode && <LinkChip label="Agent" value={d.links.agentCode} />}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Timeline" description="Every action on this dispute, in order.">
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {d.events.map((e) => (
                  <li key={e.eventId} className="relative">
                    <span className="absolute -left-[27px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
                      <CircleDot className="h-3.5 w-3.5 text-navy-500" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-[#0B1220]">{e.type.replace(/_/g, ' ')}</span>
                      {e.fromStatus && e.toStatus && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                          {e.fromStatus.replace(/_/g, ' ')} <ArrowRight className="h-3 w-3" /> {e.toStatus.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    {e.note && <p className="mt-0.5 text-sm text-slate-600">{e.note}</p>}
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {e.actorType}
                      {e.actorType === 'CUSTOMER' ? '' : ` · ${e.actorId.slice(0, 8)}`} ·{' '}
                      {new Date(e.createdAt).toLocaleString('en-NG', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </li>
                ))}
              </ol>

              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addNote()}
                  placeholder="Add a note to the record…"
                  className="h-10 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
                />
                <button
                  type="button"
                  disabled={busy || note.trim().length < 2}
                  onClick={addNote}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#0B1220] px-3 py-2 text-sm font-black text-white disabled:bg-slate-300"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  Note
                </button>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard title="Actions">
              {nextStates.length === 0 ? (
                <div>
                  <p className="text-sm text-slate-500">
                    This dispute is closed ({d.status.replace(/_/g, ' ')}).
                  </p>
                  {d.resolutionNote && (
                    <div className="mt-2 rounded-md bg-[#F8FAF4] p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Resolution</p>
                      <p className="mt-0.5 text-sm text-slate-700">{d.resolutionNote}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {nextStates.map((to) => {
                    const needsNote = to === 'RESOLVED' || to === 'REJECTED';
                    const isOpen = transitionTo === to;
                    return (
                      <div key={to}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => (needsNote ? setTransitionTo(isOpen ? null : to) : doTransition(to))}
                          className={
                            to === 'RESOLVED'
                              ? 'w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700'
                              : to === 'REJECTED'
                                ? 'w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-black text-red-700'
                                : to === 'ESCALATED'
                                  ? 'w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-black text-amber-700'
                                  : 'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-black text-[#0B1220]'
                          }
                        >
                          Move to {to.replace(/_/g, ' ')}
                        </button>
                        {isOpen && needsNote && (
                          <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                            <textarea
                              value={transitionNote}
                              onChange={(e) => setTransitionNote(e.target.value)}
                              rows={2}
                              placeholder={to === 'RESOLVED' ? 'How was it resolved?' : 'Why is it rejected?'}
                              className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm outline-none focus:border-navy-700"
                            />
                            <button
                              type="button"
                              disabled={busy || transitionNote.trim().length < 4}
                              onClick={() => doTransition(to)}
                              className="inline-flex items-center gap-1.5 rounded-md bg-[#0B1220] px-3 py-1.5 text-xs font-black text-white disabled:bg-slate-300"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Confirm {to.replace(/_/g, ' ').toLowerCase()}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Details">
              <Row label="Raised by">{d.raisedByType}</Row>
              <Row label="Assigned">{d.assignedToAdminId ? d.assignedToAdminId.slice(0, 8) : 'Unassigned'}</Row>
              <Row label="Opened">
                {new Date(d.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Row>
              {d.resolvedAt && (
                <Row label="Closed">
                  {new Date(d.resolvedAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Row>
              )}
            </SectionCard>
          </div>
        </div>

        <Link href="/disputes" className="inline-block text-sm font-black text-navy-700 hover:underline">
          ← All disputes
        </Link>
      </div>
    </>
  );
}

function LinkChip({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-[#F8FAF4] px-2.5 py-1 font-mono text-[10px] text-slate-600">
      <span className="font-black uppercase text-slate-400">{label}</span>
      {value}
    </span>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-[#0B1220]">{children}</span>
    </div>
  );
}