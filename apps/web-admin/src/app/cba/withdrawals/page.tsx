'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminCbaWithdrawalRow, CbaWithdrawalStatus } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/api';

const FILTERS: Array<{ label: string; value: CbaWithdrawalStatus | '' }> = [
  { label: 'Awaiting approval', value: 'AWAITING_APPROVAL' },
  { label: 'Needs review', value: 'REVIEW_REQUIRED' },
  { label: 'Paid, not settled', value: 'PAID' },
  { label: 'On its way', value: 'PAYOUT_PENDING' },
  { label: 'All recent', value: '' },
];

const TONE: Record<CbaWithdrawalStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  LOCKING: 'info',
  FAILED: 'neutral',
  AWAITING_APPROVAL: 'warning',
  LOCKED: 'info',
  PAYOUT_PENDING: 'info',
  PAID: 'warning',
  SUCCEEDED: 'success',
  RESTORED: 'neutral',
  REVIEW_REQUIRED: 'danger',
};

export default function CbaWithdrawalsPage() {
  return (
    <AdminShell>
      {(session) =>
        session.role === 'FINANCE_OFFICER' ? (
          <Body readOnly={session.tier === 'AUDITOR'} />
        ) : (
          <div className="mx-auto max-w-3xl p-8 text-sm text-slate-600">Wallet withdrawals are available to Finance officers only.</div>
        )
      }
    </AdminShell>
  );
}

function Body({ readOnly }: { readOnly: boolean }) {
  const [filter, setFilter] = useState<CbaWithdrawalStatus | ''>('AWAITING_APPROVAL');
  const [rows, setRows] = useState<AdminCbaWithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.cba.adminWithdrawals(filter || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load withdrawals.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const act = async (row: AdminCbaWithdrawalRow, action: 'approve' | 'reject' | 'refresh') => {
    if (action !== 'refresh') {
      const verb = action === 'approve' ? 'Approve and pay out' : 'Reject and return';
      if (!window.confirm(`${verb} ${formatNaira(row.amountNgn)} to •••• ${row.accountLast4}?`)) return;
    }

    setBusy(row.withdrawalId);
    setNotice(null);
    try {
      const result =
        action === 'approve'
          ? await api.cba.adminApproveWithdrawal(row.withdrawalId)
          : action === 'reject'
            ? await api.cba.adminRejectWithdrawal(row.withdrawalId)
            : await api.cba.adminRefreshWithdrawal(row.withdrawalId);
      setNotice(`Withdrawal ${row.withdrawalId.slice(0, 8)} is now ${result.status.replaceAll('_', ' ').toLowerCase()}.`);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'That action did not complete.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance · CBA wallets"
        title="Wallet withdrawals"
        description="Withdrawals from customer Winnings and agent Earnings to their own BVN-matched bank accounts. Approving releases a payout that is already locked; rejecting returns the money."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Wallet withdrawals' }]}
        rightSlot={
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-navy-700 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        }
      />
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setFilter(f.value)}
              className={filter === f.value ? 'rounded-md bg-navy-800 px-3 py-1.5 text-xs font-bold text-white' : 'rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600'}
            >
              {f.label}
            </button>
          ))}
        </div>

        {notice && <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-navy-900">{notice}</p>}

        <SectionCard title="Withdrawals" padded={false}>
          {error ? (
            <p role="alert" className="p-5 text-sm text-red-700">{error}</p>
          ) : loading ? (
            <p className="p-5 text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Nothing here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Withdrawal</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">To</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Monnify</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.withdrawalId} className="align-top">
                      <td className="px-4 py-3">
                        <span className="block font-mono text-xs text-navy-900" title={row.withdrawalId}>{row.withdrawalId.slice(0, 12)}…</span>
                        <span className="mt-1 block text-xs text-slate-500">{when(row.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {row.ownerType}
                        <span className="block font-mono text-[11px] text-slate-400">{row.walletId.slice(0, 8)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-navy-900">{formatNaira(row.amountNgn)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.bankCode} ····{row.accountLast4}</td>
                      <td className="px-4 py-3">
                        <StatusPill tone={TONE[row.status]}>{row.status.replaceAll('_', ' ')}</StatusPill>
                        {row.failureReason && <span className="mt-1 block text-xs text-slate-500">{row.failureReason.replaceAll('_', ' ')}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {row.payoutRawStatus ?? row.payoutStatus ?? '—'}
                        <span className="block break-all font-mono text-[11px] text-slate-400">{row.payoutReference}</span>
                      </td>
                      <td className="px-4 py-3">
                        {readOnly ? (
                          <span className="text-xs text-slate-400">Read-only</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {row.status === 'AWAITING_APPROVAL' && (
                              <>
                                <ActionButton label="Approve" onClick={() => void act(row, 'approve')} disabled={busy !== null} primary />
                                <ActionButton label="Reject" onClick={() => void act(row, 'reject')} disabled={busy !== null} />
                              </>
                            )}
                            {['LOCKED', 'PAYOUT_PENDING', 'PAID'].includes(row.status) && (
                              <ActionButton label={busy === row.withdrawalId ? 'Checking…' : 'Check now'} onClick={() => void act(row, 'refresh')} disabled={busy !== null} />
                            )}
                            {row.status === 'REVIEW_REQUIRED' && (
                              <a href="/cba/transfers" className="text-xs font-bold text-navy-700 underline">Resolve in transfer review</a>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function ActionButton({ label, onClick, disabled, primary }: { label: string; onClick: () => void; disabled: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={primary ? 'rounded-md bg-navy-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50' : 'rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-navy-700 hover:bg-slate-50 disabled:opacity-50'}
    >
      {label}
    </button>
  );
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
