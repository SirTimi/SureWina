'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type {
  AdminFinanceWalletRow,
  AdminWalletFundingReview,
} from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/api';

const PAGE_SIZE = 25;

type OwnerFilter = '' | 'CUSTOMER' | 'AGENT';
type StatusFilter = '' | 'ACTIVE' | 'FROZEN' | 'CLOSED';

export default function AdminWalletsPage() {
  return (
    <AdminShell>
      {() => <WalletsBody />}
    </AdminShell>
  );
}

function WalletsBody() {
  const [wallets, setWallets] = useState<AdminFinanceWalletRow[]>([]);
  const [review, setReview] = useState<AdminWalletFundingReview[]>([]);
  const [ownerType, setOwnerType] = useState<OwnerFilter>('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [walletResult, reviewResult] = await Promise.all([
        api.admin.financeWallets({
          ownerType: ownerType || undefined,
          status: status || undefined,
          search: search || undefined,
          page,
          pageSize: PAGE_SIZE,
        }),
        api.admin.financeWalletFundingReview(),
      ]);

      setWallets(walletResult.wallets);
      setTotal(walletResult.total);
      setReview(reviewResult.fundings);
    } catch (err) {
      setWallets([]);
      setReview([]);
      setTotal(0);
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load wallet operations.',
      );
    } finally {
      setLoading(false);
    }
  }, [ownerType, page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleAvailable = useMemo(
    () => wallets.reduce((sum, wallet) => sum + wallet.availableNgn, 0),
    [wallets],
  );

  const visibleHeld = useMemo(
    () => wallets.reduce((sum, wallet) => sum + wallet.heldNgn, 0),
    [wallets],
  );

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Wallet operations"
        description="Customer and agent wallet balances, owner context, funding exceptions, and ledger-backed activity."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Wallets' },
        ]}
        rightSlot={
          <Link
            href="/treasury"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-black text-navy-700"
          >
            Treasury
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={WalletCards}
            label="Wallets matching filters"
            value={String(total)}
          />
          <Metric
            icon={Users}
            label="Visible available"
            value={formatNaira(visibleAvailable)}
          />
          <Metric
            icon={ShieldAlert}
            label="Visible held"
            value={formatNaira(visibleHeld)}
          />
          <Metric
            icon={AlertTriangle}
            label="Funding review required"
            value={String(review.length)}
            danger={review.length > 0}
          />
        </div>

        <SectionCard
          title="Find wallets"
          description="Search by customer phone/email/name or agent code/phone/name."
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
            <form
              className="flex min-w-0 gap-2"
              onSubmit={submitSearch}
            >
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Phone, email, agent code, or name"
                  className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-[#0B1220] outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/20"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-navy-800 px-4 text-sm font-black text-white"
              >
                Search
              </button>
            </form>

            <select
              value={ownerType}
              onChange={(event) => {
                setPage(1);
                setOwnerType(event.target.value as OwnerFilter);
              }}
              className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-navy-950"
            >
              <option value="">All owners</option>
              <option value="CUSTOMER">Customers</option>
              <option value="AGENT">Agents</option>
            </select>

            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as StatusFilter);
              }}
              className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-navy-950"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="FROZEN">Frozen</option>
              <option value="CLOSED">Closed</option>
            </select>

            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-navy-700"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </SectionCard>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <SectionCard
          title="Wallet registry"
          description="Balances are derived from immutable ledger entries, not cached profile fields."
          padded={false}
        >
          {loading ? (
            <div className="h-72 animate-pulse bg-slate-50" />
          ) : wallets.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              No wallets match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Owner</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-right">Available</th>
                    <th className="px-4 py-2 text-right">Held</th>
                    <th className="px-4 py-2 text-left">Wallet</th>
                    <th className="px-4 py-2 text-left">Latest funding</th>
                    <th className="px-4 py-2 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wallets.map((wallet) => (
                    <tr key={wallet.walletId}>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy-50 text-navy-700">
                            {wallet.owner.type === 'AGENT' ? (
                              <Users className="h-4 w-4" />
                            ) : (
                              <UserRound className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-[#0B1220]">
                              {wallet.owner.name ?? wallet.owner.identifier}
                            </p>
                            <p className="truncate font-mono text-xs text-slate-500">
                              {wallet.owner.identifier}
                            </p>
                            {wallet.owner.secondary && (
                              <p className="truncate text-xs text-slate-400">
                                {wallet.owner.secondary}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          tone={wallet.ownerType === 'AGENT' ? 'violet' : 'info'}
                        >
                          {wallet.ownerType}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3 text-right font-display font-black tabular-nums text-[#0B1220]">
                        {formatNaira(wallet.availableNgn)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-600">
                        {formatNaira(wallet.heldNgn)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone={walletTone(wallet.status)}>
                          {wallet.status}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3">
                        {wallet.latestFunding ? (
                          <div>
                            <p className="font-bold text-[#0B1220]">
                              {wallet.latestFunding.gateway} ·{' '}
                              {formatNaira(wallet.latestFunding.amountNgn)}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {wallet.latestFunding.status} ·{' '}
                              {formatDate(wallet.latestFunding.createdAt)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            No funding yet
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/wallets/${wallet.walletId}`}
                          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em] text-navy-700 hover:underline"
                        >
                          Open
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              Page {page} of {pageCount} · {total} wallet{total === 1 ? '' : 's'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-navy-700 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pageCount || loading}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-navy-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Funding requiring review"
          description="Provider-verification mismatches that were deliberately not credited automatically."
          padded={false}
        >
          {review.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              No wallet funding currently requires finance review.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Owner</th>
                    <th className="px-4 py-2 text-left">Provider</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Reference</th>
                    <th className="px-4 py-2 text-left">Reason</th>
                    <th className="px-4 py-2 text-right">Wallet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {review.map((funding) => (
                    <tr key={funding.fundingId}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-[#0B1220]">
                          {funding.ownerName ??
                            funding.ownerIdentifier ??
                            'Unknown owner'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {funding.ownerType}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-bold">
                        {funding.gateway}
                      </td>
                      <td className="px-4 py-3 text-right font-display font-black tabular-nums">
                        {formatNaira(funding.amountNgn)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {funding.reference}
                      </td>
                      <td className="max-w-[320px] px-4 py-3 text-xs text-slate-600">
                        {funding.failureReason ?? 'Provider verification mismatch'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/wallets/${funding.walletId}`}
                          className="text-xs font-black uppercase tracking-[0.12em] text-navy-700 hover:underline"
                        >
                          Inspect
                        </Link>
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

function Metric({
  icon: Icon,
  label,
  value,
  danger = false,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={
          danger
            ? 'flex h-9 w-9 items-center justify-center rounded-md bg-red-50 text-red-700'
            : 'flex h-9 w-9 items-center justify-center rounded-md bg-navy-50 text-navy-700'
        }
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-black text-[#0B1220]">
        {value}
      </p>
    </div>
  );
}

function walletTone(status: AdminFinanceWalletRow['status']) {
  if (status === 'ACTIVE') return 'success' as const;
  if (status === 'FROZEN') return 'warning' as const;
  return 'danger' as const;
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
