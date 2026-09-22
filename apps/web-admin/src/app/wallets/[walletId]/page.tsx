'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UnlockKeyhole,
  WalletCards,
} from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type {
  AdminFinanceWalletDetail,
  WalletFundingView,
  WalletLedgerTransaction,
} from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import type { AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

export default function AdminWalletDetailPage() {
  return (
    <AdminShell>
      {(session) => <WalletDetailBody session={session} />}
    </AdminShell>
  );
}

function WalletDetailBody({ session }: { session: AdminSession }) {
  const params = useParams<{ walletId: string }>();
  const walletId = params.walletId;

  const [wallet, setWallet] = useState<AdminFinanceWalletDetail | null>(null);
  const [transactions, setTransactions] = useState<WalletLedgerTransaction[]>([]);
  const [fundings, setFundings] = useState<WalletFundingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [overview, history, fundingHistory] = await Promise.all([
        api.admin.financeWalletOverview(walletId),
        api.admin.financeWalletHistory(walletId, 1, 30),
        api.admin.financeWalletFundingHistory(walletId, 1, 30),
      ]);

      setWallet(overview);
      setTransactions(history.transactions);
      setFundings(fundingHistory.fundings);
    } catch (err) {
      setWallet(null);
      setTransactions([]);
      setFundings([]);
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load wallet details.',
      );
    } finally {
      setLoading(false);
    }
  }, [walletId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage =
    session.tier !== 'AUDITOR' &&
    (session.role === 'FINANCE_OFFICER' || session.tier === 'SUPER_ADMIN');

  const walletActivity = useMemo(
    () =>
      transactions.map((transaction) => ({
        transaction,
        delta: walletDelta(transaction),
      })),
    [transactions],
  );

  const runStatusAction = async (
    action: 'freeze' | 'unfreeze' | 'close',
  ) => {
    const cleanReason = reason.trim();

    if (!cleanReason) {
      setError('Enter a reason before changing wallet status.');
      return;
    }

    if (
      action === 'close' &&
      !window.confirm(
        'Close this wallet? Closing is only allowed at zero balance with no active holds and cannot be undone from this screen.',
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (action === 'freeze') {
        await api.admin.financeFreezeWallet(walletId, cleanReason);
      } else if (action === 'unfreeze') {
        await api.admin.financeUnfreezeWallet(walletId, cleanReason);
      } else {
        await api.admin.financeCloseWallet(walletId, cleanReason);
      }

      setReason('');
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not update wallet status.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader
          eyebrow="Finance · Wallets"
          title="Wallet detail"
          breadcrumbs={[
            { label: 'Admin', href: '/' },
            { label: 'Wallets', href: '/wallets' },
            { label: 'Loading' },
          ]}
        />
        <div className="mx-auto max-w-[1400px] px-6 py-5">
          <div className="h-80 animate-pulse rounded-xl bg-white" />
        </div>
      </>
    );
  }

  if (error && !wallet) {
    return (
      <>
        <PageHeader
          eyebrow="Finance · Wallets"
          title="Wallet unavailable"
          breadcrumbs={[
            { label: 'Admin', href: '/' },
            { label: 'Wallets', href: '/wallets' },
            { label: 'Error' },
          ]}
        />
        <div className="mx-auto max-w-[1000px] px-6 py-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            {error}
          </div>
        </div>
      </>
    );
  }

  if (!wallet) return null;

  return (
    <>
      <PageHeader
        eyebrow="Finance · Wallets"
        title={wallet.owner.name ?? wallet.owner.identifier}
        description={`${wallet.owner.type} wallet · ${wallet.owner.identifier}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Wallets', href: '/wallets' },
          { label: wallet.owner.identifier },
        ]}
        rightSlot={
          <Link
            href="/wallets"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-black text-navy-700"
          >
            <ArrowLeft className="h-4 w-4" />
            All wallets
          </Link>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Available" value={formatNaira(wallet.availableNgn)} />
          <Metric label="Held" value={formatNaira(wallet.heldNgn)} />
          <Metric label="Total wallet liability" value={formatNaira(wallet.totalNgn)} />
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Wallet status
            </p>
            <div className="mt-3">
              <StatusPill tone={walletTone(wallet.status)}>
                {wallet.status}
              </StatusPill>
            </div>
            <p className="mt-3 font-mono text-[11px] text-slate-400">
              {wallet.walletId}
            </p>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <SectionCard
              title="Wallet activity"
              description="Ledger-backed movements. Agent sales are debits; verified top-ups and agent prize reimbursements are credits."
              rightSlot={
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={busy}
                  className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-navy-700 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              }
              padded={false}
            >
              {walletActivity.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  No wallet ledger activity yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {walletActivity.map(({ transaction, delta }) => (
                    <div
                      key={transaction.ledgerTxnId}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div
                        className={
                          delta > 0
                            ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700'
                            : delta < 0
                              ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700'
                              : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500'
                        }
                      >
                        {delta > 0 ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : delta < 0 ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <WalletCards className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-[#0B1220]">
                            {transaction.description ?? humanize(transaction.kind)}
                          </p>
                          <StatusPill tone={kindTone(transaction.kind)}>
                            {humanize(transaction.kind)}
                          </StatusPill>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {transaction.referenceType} · {formatDate(transaction.occurredAt)}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                          {transaction.referenceId}
                        </p>
                      </div>

                      <p
                        className={
                          delta > 0
                            ? 'font-display text-base font-black tabular-nums text-emerald-700'
                            : 'font-display text-base font-black tabular-nums text-[#0B1220]'
                        }
                      >
                        {delta === 0
                          ? '—'
                          : `${delta > 0 ? '+' : '-'}${formatNaira(Math.abs(delta))}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Funding history"
              description="Monnify and Flutterwave wallet funding attempts and verification outcomes."
              padded={false}
            >
              {fundings.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  No funding attempts for this wallet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left">Provider</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Reference</th>
                        <th className="px-4 py-2 text-left">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fundings.map((funding) => (
                        <tr key={funding.fundingId}>
                          <td className="px-4 py-3 font-bold">
                            {funding.gateway}
                          </td>
                          <td className="px-4 py-3 text-right font-display font-black tabular-nums">
                            {formatNaira(funding.amountNgn)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill tone={fundingTone(funding.status)}>
                              {funding.status.replace('_', ' ')}
                            </StatusPill>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">
                            {funding.reference}
                            {funding.failureReason && (
                              <p className="mt-1 max-w-[320px] font-sans text-[11px] text-red-600">
                                {funding.failureReason}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {formatDate(funding.initiatedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          <aside className="space-y-5">
            <SectionCard
              title="Owner"
              description="Identity attached to the wallet."
            >
              <dl className="space-y-3 text-sm">
                <InfoRow label="Owner type" value={wallet.owner.type} />
                <InfoRow label="Name" value={wallet.owner.name ?? '—'} />
                <InfoRow label="Identifier" value={wallet.owner.identifier} />
                <InfoRow label="Secondary" value={wallet.owner.secondary ?? '—'} />
                <InfoRow label="Account status" value={wallet.owner.status ?? '—'} />
                {wallet.owner.tier && (
                  <InfoRow label="Agent tier" value={wallet.owner.tier} />
                )}
                {wallet.owner.commissionRate !== null && (
                  <InfoRow
                    label="Commission rate"
                    value={`${Math.round(wallet.owner.commissionRate * 10000) / 100}%`}
                  />
                )}
              </dl>
            </SectionCard>

            {wallet.agentActivity && (
              <SectionCard
                title="Prepaid agent activity"
                description="All-time finance totals derived from prepaid sale, commission, and reimbursement ledger journals."
              >
                <dl className="space-y-3 text-sm">
                  <InfoRow
                    label="Prepaid sales"
                    value={String(wallet.agentActivity.prepaidSaleCount)}
                  />
                  <InfoRow
                    label="Gross sales"
                    value={formatNaira(wallet.agentActivity.grossPrepaidSalesNgn)}
                  />
                  <InfoRow
                    label="Wallet used"
                    value={formatNaira(wallet.agentActivity.walletUsedNgn)}
                  />
                  <InfoRow
                    label="Commission recognised"
                    value={formatNaira(wallet.agentActivity.commissionRecognizedNgn)}
                  />
                  <InfoRow
                    label="Prize reimbursements"
                    value={formatNaira(wallet.agentActivity.prizeReimbursedNgn)}
                  />
                </dl>
              </SectionCard>
            )}

            {wallet.legacyRemittance && (
              <SectionCard
                title="Historical remittance"
                description="Legacy debt is separate from prepaid wallet operations."
              >
                <p className="font-display text-3xl font-black text-[#0B1220]">
                  {formatNaira(wallet.legacyRemittance.outstandingNgn)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {wallet.legacyRemittance.awaitingFinanceCount} payment
                  {wallet.legacyRemittance.awaitingFinanceCount === 1 ? '' : 's'} awaiting finance confirmation.
                </p>
                <Link
                  href="/remittance"
                  className="mt-4 inline-flex text-sm font-black text-navy-700 hover:underline"
                >
                  Open legacy remittance
                </Link>
              </SectionCard>
            )}

            <SectionCard
              title="Wallet controls"
              description="Status changes are audited. Closing requires zero available/held balance and no active holds."
            >
              {!canManage ? (
                <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Read-only access. Finance or Super clearance is required to change wallet status.
                </div>
              ) : wallet.status === 'CLOSED' ? (
                <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                  This wallet is closed. Status controls are no longer available.
                </div>
              ) : (
                <>
                  <label className="block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                    Required reason
                  </label>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={300}
                    rows={3}
                    placeholder="Why is this wallet status changing?"
                    className="mt-2 w-full rounded-md border border-slate-200 bg-white p-3 text-sm text-[#0B1220] outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/20"
                  />

                  <div className="mt-3 grid gap-2">
                    {wallet.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runStatusAction('freeze')}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-black text-amber-800 disabled:opacity-50"
                      >
                        <LockKeyhole className="h-4 w-4" />
                        Freeze wallet
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runStatusAction('unfreeze')}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800 disabled:opacity-50"
                      >
                        <UnlockKeyhole className="h-4 w-4" />
                        Unfreeze wallet
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runStatusAction('close')}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-black text-red-700 disabled:opacity-50"
                    >
                      <Ban className="h-4 w-4" />
                      Close zero-balance wallet
                    </button>
                  </div>
                </>
              )}
            </SectionCard>
          </aside>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-black text-[#0B1220]">
        {value}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="max-w-[220px] text-right font-bold text-[#0B1220]">
        {value}
      </dd>
    </div>
  );
}

function walletDelta(transaction: WalletLedgerTransaction) {
  return transaction.entries
    .filter((entry) => entry.belongsToWallet)
    .reduce(
      (sum, entry) =>
        sum + (entry.side === 'CREDIT' ? entry.amountNgn : -entry.amountNgn),
      0,
    );
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function walletTone(status: AdminFinanceWalletDetail['status']) {
  if (status === 'ACTIVE') return 'success' as const;
  if (status === 'FROZEN') return 'warning' as const;
  return 'danger' as const;
}

function fundingTone(status: WalletFundingView['status']) {
  if (status === 'CREDITED') return 'success' as const;
  if (status === 'FAILED') return 'danger' as const;
  if (status === 'REVIEW_REQUIRED') return 'warning' as const;
  return 'info' as const;
}

function kindTone(kind: string) {
  if (kind === 'FUNDING' || kind === 'PRIZE_PAYOUT') return 'success' as const;
  if (kind === 'AGENT_SALE' || kind === 'PURCHASE') return 'warning' as const;
  if (kind === 'AGENT_REMITTANCE') return 'violet' as const;
  return 'neutral' as const;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
