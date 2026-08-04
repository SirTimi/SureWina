'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, FileCheck, ShieldCheck, XCircle } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminClaimRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import type { AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

const FILTERS = [
  { label: 'Awaiting review', value: 'KYC_PENDING' },
  { label: 'Notified', value: 'NOTIFIED' },
  { label: 'Selection made', value: 'SELECTION_MADE' },
  { label: 'Cleared', value: 'KYC_CLEARED' },
  { label: 'All', value: '' },
];

export default function AdminClaimsPage() {
  return (
    <AdminShell>
      {(session) => <Body session={session} />}
    </AdminShell>
  );
}

function Body({ session }: { session: AdminSession }) {
  const [status, setStatus] = useState('KYC_PENDING');
  const [rows, setRows] = useState<AdminClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openReview, setOpenReview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    api.admin
      .listClaims(status || undefined)
      .then((res) => setRows(res.claims))
      .catch((e) => {
        setRows([]);
        setError(e instanceof Error ? e.message : 'Could not load claims.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  const review = async (claimId: string, decision: 'APPROVE' | 'REJECT') => {
    setBusy(true);
    try {
      await api.admin.reviewClaimKyc(claimId, decision, note.trim() || undefined);
      setOpenReview(null);
      setNote('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Claims"
        title="KYC review queue"
        description="Approve or reject winner verification. Approval releases the claim for payout or collection."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Claims' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="inline-flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              className={
                status === f.value
                  ? 'rounded-sm bg-[#0B1220] px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white'
                  : 'rounded-sm px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-500 hover:bg-slate-50'
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : rows.length === 0 ? (
          <SectionCard title="Nothing to review">
            <p className="py-6 text-center text-sm text-slate-500">
              No claims in this state.
            </p>
          </SectionCard>
        ) : (
          <div className="space-y-3">
            {rows.map((c) => {
              const evidenceComplete =
                !!c.kycBvnVerifiedAt &&
                c.hasIdDoc &&
                c.hasSelfie &&
                (c.claimType !== 'CASH' || c.bankResolved);

              return (
                <div key={c.claimId} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-black text-[#0B1220]">{c.winnerTicketRef}</p>
                        <StatusPill tone={statusToTone(c.status)}>{c.status}</StatusPill>
                        {c.claimType && <StatusPill tone="info">{c.claimType}</StatusPill>}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{c.prizeDescription}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">
                        {c.winnerPhone} · {c.drawCode}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-display text-2xl font-black text-[#0B1220] tabular-nums">
                        {formatNaira(c.netPrizeValueNgn)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatNaira(c.grossPrizeValueNgn)} gross · {formatNaira(c.whtAmountNgn)} WHT
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Evidence ok={!!c.kycBvnVerifiedAt} label="BVN verified" />
                    <Evidence ok={c.hasIdDoc} label="ID document" />
                    <Evidence ok={c.hasSelfie} label="Selfie" />
                    {c.claimType === 'CASH' && <Evidence ok={c.bankResolved} label="Bank resolved" />}
                  </div>

                  {c.status === 'KYC_PENDING' && (
                    <>
                      {openReview === c.claimId ? (
                        <div className="mt-4 rounded-lg border border-slate-200 bg-[#F8FAF4] p-4">
                          <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            placeholder="Review note (required for rejection)…"
                            className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-navy-700"
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy || !evidenceComplete}
                              onClick={() => review(c.claimId, 'APPROVE')}
                              title={evidenceComplete ? '' : 'All evidence must be present before approval'}
                              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:bg-slate-300"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy || note.trim().length < 4}
                              onClick={() => review(c.claimId, 'REJECT')}
                              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-black text-white disabled:bg-slate-300"
                            >
                              <XCircle className="h-4 w-4" />
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenReview(null);
                                setNote('');
                              }}
                              className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                          {!evidenceComplete && (
                            <p className="mt-2 text-xs text-amber-700">
                              Approval is blocked until every evidence item above is present.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-4">
                          <GuardedActionButton
                            session={session}
                            action="REVIEW_CLAIM_KYC"
                            icon={<FileCheck className="h-4 w-4" />}
                            onClick={() => {
                              setOpenReview(c.claimId);
                              setNote('');
                            }}
                            className="rounded-md border-navy-200 bg-navy-50 text-navy-700"
                          >
                            Review KYC
                          </GuardedActionButton>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function Evidence({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? 'inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700'
          : 'inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400'
      }
    >
      <ShieldCheck className="h-3 w-3" />
      {label}
    </span>
  );
}