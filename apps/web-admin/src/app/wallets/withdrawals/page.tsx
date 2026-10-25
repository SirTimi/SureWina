'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type {
  AdminCbaWithdrawalQueue,
  AdminCbaWithdrawalQueueRow,
  AdminCbaWithdrawalVerification,
} from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/api';

function displayDate(value: string) {
  return new Date(value).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function reviewLabel(row: AdminCbaWithdrawalQueueRow) {
  switch (row.nextReviewStep) {
    case 'WAIT_FOR_EXTERNAL_CONTRACT_OR_CANCEL_UNSUBMITTED':
      return 'Await provider approval or cancel before submission';
    case 'RECONCILE_CBA_TRANSACTION_WITHOUT_RETRY':
      return 'Investigate CBA debit; never retry blindly';
    case 'CONFIRM_EXTERNAL_SETTLEMENT_FUNDING':
      return 'Verify externally settled payout funds';
    case 'VERIFY_PAYSTACK_REFERENCE_WITHOUT_RETRY':
      return 'Verify original Paystack reference';
    case 'VERIFY_CBA_RESTORATION_BEFORE_RELEASE':
      return 'Verify external restoration before releasing funds';
    default:
      return 'Manual Finance reconciliation required';
  }
}

export default function CbaWithdrawalQueuePage() {
  return (
    <AdminShell>
      {(session) =>
        session.role === 'FINANCE_OFFICER' ? (
          <QueueBody />
        ) : (
          <div className="mx-auto max-w-3xl p-8 text-sm text-slate-600">
            CBA withdrawal evidence is available to Finance officers only.
          </div>
        )
      }
    </AdminShell>
  );
}

function QueueBody() {
  const [queue, setQueue] = useState<AdminCbaWithdrawalQueue | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verification, setVerification] = useState<AdminCbaWithdrawalVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQueue(await api.admin.cbaWithdrawalQueue(50, page));
    } catch (err) {
      setQueue(null);
      setError(err instanceof Error ? err.message : 'Could not load withdrawal queue.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  const inspect = async (withdrawalId: string) => {
    setSelectedId(withdrawalId);
    setVerification(null);
    setVerificationError(null);
    setVerifying(true);
    try {
      setVerification(await api.admin.verifyCbaWithdrawal(withdrawalId));
    } catch (err) {
      setVerificationError(
        err instanceof Error ? err.message : 'Could not verify external evidence.',
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance · CBA"
        title="Withdrawal review queue"
        description="Read-only investigation of CBA cash-out reservations and uncertain transfers. This screen never sends, settles or restores money."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Wallets', href: '/wallets' },
          { label: 'CBA withdrawals' },
        ]}
        rightSlot={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-navy-700 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p>
            External CBA debits and Paystack transfers are not authorized by this view.
            A successful evidence check is not settlement approval. Do not manually
            release held balances or resend unknown external transfers.
          </p>
        </div>

        <SectionCard
          title="Unresolved requests"
          description="Oldest updated requests first. Review the next page to inspect additional records."
          rightSlot={
            <span className="text-xs font-bold text-slate-500">
              {queue ? String(queue.count) : '—'} on page {page}
            </span>
          }
          padded={false}
        >
          {error ? (
            <p role="alert" className="p-5 text-sm text-red-700">{error}</p>
          ) : loading ? (
            <p className="p-5 text-sm text-slate-500">Loading withdrawal reviews…</p>
          ) : !queue || queue.withdrawals.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No unresolved CBA withdrawal records in this tenant.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Request</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Next review step</th>
                    <th className="px-4 py-3">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {queue.withdrawals.map((row) => (
                    <tr key={row.withdrawalId} className="align-top">
                      <td className="px-4 py-3">
                        <span className="block font-mono text-xs text-navy-900" title={row.withdrawalId}>
                          {row.withdrawalId.slice(0, 12)}…
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">{displayDate(row.updatedAt)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-navy-900">
                        {formatNaira(row.amountNgn)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {row.destination.bankCode} ····{row.destination.accountLast4}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone="warning">{row.status.replaceAll('_', ' ')}</StatusPill>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-600">{reviewLabel(row)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void inspect(row.withdrawalId)}
                          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-navy-700 hover:bg-slate-50"
                        >
                          Check evidence
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                <button
                  type="button"
                  disabled={page === 1 || loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-navy-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-500">Page {page}</span>
                <button
                  type="button"
                  disabled={!queue.hasMore || loading}
                  onClick={() => setPage((value) => value + 1)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-navy-700 disabled:opacity-40"
                >
                  Next page
                </button>
              </div>
            </div>
          )}
        </SectionCard>

        {selectedId && (
          <SectionCard
            title="Independent evidence verification"
            description="Read-only lookup by the original immutable external references."
            rightSlot={
              <button
                type="button"
                disabled={verifying}
                onClick={() => void inspect(selectedId)}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-navy-700 disabled:opacity-50"
              >
                Verify again
              </button>
            }
          >
            {verifying ? (
              <p className="text-sm text-slate-500">Checking CBA and Paystack evidence…</p>
            ) : verificationError ? (
              <p role="alert" className="text-sm text-red-700">{verificationError}</p>
            ) : verification ? (
              <div className="space-y-4 text-sm">
                <p className="break-all font-mono text-xs text-slate-600">{verification.withdrawalId}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Evidence label="Local wallet hold" value={verification.internalHold.status ?? 'MISSING'} />
                  <Evidence label="CBA debit" value={verification.cba.evidence} />
                  <Evidence label="Paystack bank transfer" value={verification.paystack.evidence} />
                </div>
                <p className="text-slate-600">
                  CBA reference: <span className="break-all font-mono">{verification.cba.reference}</span>
                </p>
                <p className="text-slate-600">
                  Paystack reference: <span className="break-all font-mono">{verification.paystack.reference}</span>
                </p>
                {verification.problems.length > 0 && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
                    <p className="font-bold">Requires investigation</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {verification.problems.map((problem) => <li key={problem}>{problem}</li>)}
                    </ul>
                  </div>
                )}
                {verification.readyForManualSettlementReview && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    Both providers returned matching evidence. External settlement funding
                    and internal journal confirmation still require separate Finance approval.
                  </div>
                )}
                <p className="font-semibold text-slate-700">
                  Automatic finalization permitted: No
                </p>
              </div>
            ) : null}
          </SectionCard>
        )}

        <p className="text-xs text-slate-500">
          For balances, funding and ledger activity, return to <Link className="font-bold text-navy-700 underline" href="/wallets">Wallet operations</Link>.
        </p>
      </div>
    </>
  );
}

function Evidence({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 break-words font-semibold text-navy-900">{value.replaceAll('_', ' ')}</p>
    </div>
  );
}
