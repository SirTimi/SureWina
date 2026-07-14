'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  Inbox,
  Package,
  Search,
} from 'lucide-react';
import { Badge, Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { DashboardClaim, PrizeClaimStatus } from '@surewina/types';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate } from '@/lib/draw-helpers';

const statusLabel: Record<PrizeClaimStatus, string> = {
  NOTIFIED: 'Awaiting selection',
  SELECTION_MADE: 'Selection confirmed',
  KYC_PENDING: 'KYC required',
  KYC_CLEARED: 'KYC cleared',
  PRODUCT_BOOKED: 'Collection booked',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CASH_PAID: 'Cash paid',
  FORFEITED: 'Forfeited',
  REVERTED_TO_PRODUCT: 'Reverted to product',
};

const statusVariant: Record<
  PrizeClaimStatus,
  'live' | 'verified' | 'warning' | 'closed' | 'jackpot' | 'daily'
> = {
  NOTIFIED: 'warning',
  SELECTION_MADE: 'live',
  KYC_PENDING: 'warning',
  KYC_CLEARED: 'live',
  PRODUCT_BOOKED: 'live',
  DISPATCHED: 'live',
  DELIVERED: 'verified',
  CASH_PAID: 'verified',
  FORFEITED: 'closed',
  REVERTED_TO_PRODUCT: 'live',
};

const actionStatuses: PrizeClaimStatus[] = ['NOTIFIED', 'KYC_PENDING'];

function formatDeadline(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();

  if (ms <= 0) return 'Past deadline';

  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;

  const hours = Math.floor(ms / (60 * 60 * 1000));
  return `${hours} hour${hours === 1 ? '' : 's'} left`;
}

function isClaimComplete(claim: DashboardClaim) {
  return claim.fulfilledAt !== null || claim.status === 'CASH_PAID' || claim.status === 'DELIVERED';
}

function isClaimActive(claim: DashboardClaim) {
  return !isClaimComplete(claim) && claim.status !== 'FORFEITED';
}

export function ClaimsListView() {
  const [claims, setClaims] = useState<DashboardClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.dashboard
      .listMyClaims()
      .then((res) => setClaims(res.claims))
      .catch((err) => setError(err.message ?? 'Could not load claims.'));
  }, []);

  const sortedClaims = useMemo(() => {
    if (!claims) return null;

    return [...claims].sort((a, b) => {
      const aActive = isClaimActive(a);
      const bActive = isClaimActive(b);

      if (aActive !== bActive) return aActive ? -1 : 1;

      return b.drawDate.localeCompare(a.drawDate);
    });
  }, [claims]);

  const filteredClaims = useMemo(() => {
    if (!sortedClaims) return null;

    const q = query.trim().toLowerCase();

    return sortedClaims.filter((claim) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'active'
            ? isClaimActive(claim)
            : !isClaimActive(claim);

      if (!matchesFilter) return false;

      if (!q) return true;

      return (
        claim.claimId.toLowerCase().includes(q) ||
        claim.ticketRef.toLowerCase().includes(q) ||
        claim.prizeDescription.toLowerCase().includes(q)
      );
    });
  }, [sortedClaims, filter, query]);

  const counts = useMemo(() => {
    const list = claims ?? [];

    return {
      active: list.filter(isClaimActive).length,
      completed: list.filter((claim) => !isClaimActive(claim)).length,
      all: list.length,
      actionNeeded: list.filter((claim) => actionStatuses.includes(claim.status)).length,
    };
  }, [claims]);

  if (error) {
    return (
      <Card
        variant="default"
        className="rounded-2xl border-red-100 bg-white p-6 text-center shadow-sm"
      >
        <AlertCircle className="mx-auto h-6 w-6 text-red-600" />
        <p className="mt-3 text-sm font-bold text-red-600">{error}</p>
      </Card>
    );
  }

  return (
    <div>
      <Card
        variant="default"
        className="mb-4 rounded-2xl border-slate-200 bg-white p-3 shadow-sm"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              <FilterButton
                active={filter === 'active'}
                onClick={() => setFilter('active')}
                label="Active"
                count={counts.active}
              />

              <FilterButton
                active={filter === 'completed'}
                onClick={() => setFilter('completed')}
                label="Completed"
                count={counts.completed}
              />

              <FilterButton
                active={filter === 'all'}
                onClick={() => setFilter('all')}
                label="All"
                count={counts.all}
              />
            </div>

            <p className="text-sm text-slate-500">
              <span className="font-mono font-bold text-navy-950">
                {(filteredClaims?.length ?? counts[filter]).toLocaleString()}
              </span>{' '}
              claim{(filteredClaims?.length ?? counts[filter]) === 1 ? '' : 's'}
              {counts.actionNeeded > 0 && (
                <>
                  {' '}
                  ·{' '}
                  <span className="font-bold text-navy-700">
                    {counts.actionNeeded} need{counts.actionNeeded === 1 ? 's' : ''} action
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search claim, ticket, or prize..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-navy-950 outline-none transition placeholder:text-slate-400 focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
            />
          </div>
        </div>
      </Card>

      {!filteredClaims ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={
                i < 3
                  ? 'h-24 animate-pulse border-b border-slate-100 bg-white'
                  : 'h-24 animate-pulse bg-white'
              }
            />
          ))}
        </div>
      ) : filteredClaims.length === 0 ? (
        <EmptyClaimsState filter={filter} hasSearch={query.trim().length > 0} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {filteredClaims.map((claim, index) => (
            <ClaimRow
              key={claim.claimId}
              claim={claim}
              isLast={index === filteredClaims.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimRow({ claim, isLast }: { claim: DashboardClaim; isLast: boolean }) {
  const isJackpot = claim.drawType === 'SATURDAY_JACKPOT';
  const isProduct = claim.claimType === 'PRODUCT';
  const isCash = claim.claimType === 'CASH';
  const isComplete = isClaimComplete(claim);
  const isForfeited = claim.status === 'FORFEITED';
  const needsAction = actionStatuses.includes(claim.status);

  const actionHref =
    claim.status === 'NOTIFIED'
      ? `/claim/${claim.claimId}`
      : claim.status === 'KYC_PENDING'
        ? `/claim/${claim.claimId}/cash/kyc`
        : `/dashboard/claims/${claim.claimId}`;

  const actionLabel =
    claim.status === 'NOTIFIED'
      ? 'Choose prize'
      : claim.status === 'KYC_PENDING'
        ? 'Complete KYC'
        : 'View claim';

  return (
    <div
      id={claim.claimId}
      className={
        isLast
          ? 'bg-white px-4 py-3.5'
          : 'border-b border-slate-100 bg-white px-4 py-3.5'
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_140px_120px] md:items-center">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
              {drawTypeShortLabel[claim.drawType]}
            </Badge>

            <Badge variant={statusVariant[claim.status]} withDot={needsAction || isClaimActive(claim)}>
              {statusLabel[claim.status]}
            </Badge>

            {isProduct && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                <Package className="h-3 w-3" />
                Product
              </span>
            )}

            {isCash && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                <Banknote className="h-3 w-3" />
                Cash
              </span>
            )}

            {!isComplete && !isForfeited && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-navy-700">
                <Clock className="h-3 w-3" />
                {formatDeadline(claim.claimDeadlineAt)}
              </span>
            )}
          </div>

          <p className="truncate font-display text-[15px] font-black text-navy-950">
            {claim.prizeDescription}
          </p>

          <p className="mt-0.5 text-xs text-slate-500">
            Won {formatDrawDate(claim.drawDate)} · Ticket{' '}
            <span className="font-mono font-semibold text-slate-700">
              {claim.ticketRef}
            </span>
          </p>

          {claim.whtAmountNgn > 0 && (
            <p className="mt-1 text-[11px] text-slate-400">
              Gross {formatNaira(claim.grossPrizeValueNgn)} − WHT{' '}
              {formatNaira(claim.whtAmountNgn)}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 md:block md:text-right">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
              Net value
            </p>
            <p className="mt-0.5 font-display text-base font-black text-navy-950">
              {formatNaira(claim.netPrizeValueNgn)}
            </p>
          </div>

          {isComplete && (
            <CheckCircle2 className="h-4 w-4 text-navy-700 md:ml-auto md:mt-1.5" />
          )}

          {needsAction && (
            <AlertCircle className="h-4 w-4 text-amber-600 md:ml-auto md:mt-1.5" />
          )}
        </div>

        <div className="md:text-right">
          {needsAction ? (
            <Link href={actionHref}>
              <Button
                variant="accent"
                size="sm"
                className="w-full rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400 md:w-auto"
              >
                {actionLabel}
              </Button>
            </Link>
          ) : (
            <Link
              href={`/dashboard/claims/${claim.claimId}`}
              className="inline-flex items-center gap-1 text-sm font-bold text-navy-700 transition hover:text-navy-800"
            >
              View
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-md bg-white px-4 py-2 text-sm font-bold text-navy-950 shadow-sm'
          : 'rounded-md px-4 py-2 text-sm font-bold text-slate-500 transition hover:text-navy-950'
      }
    >
      {label}
      <span className="ml-2 font-mono text-xs text-slate-400">{count}</span>
    </button>
  );
}

function EmptyClaimsState({
  filter,
  hasSearch,
}: {
  filter: 'active' | 'completed' | 'all';
  hasSearch: boolean;
}) {
  return (
    <Card
      variant="default"
      className="rounded-2xl border-slate-200 bg-white p-8 text-center shadow-sm"
    >
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Inbox className="h-5 w-5" />
      </div>

      <h2 className="mt-4 font-display text-xl font-black text-navy-950">
        {hasSearch
          ? 'No matching claims'
          : filter === 'active'
            ? 'No active claims'
            : filter === 'completed'
              ? 'No completed claims yet'
              : 'No claims yet'}
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        {hasSearch
          ? 'Try another ticket reference, prize name, or claim ID.'
          : filter === 'active'
            ? 'When you win and have an active prize claim, it will appear here.'
            : 'Claims will appear here after you win a draw.'}
      </p>

      {!hasSearch && filter === 'all' && (
        <Link href="/draws" className="mt-5 inline-block">
          <Button
            variant="accent"
            className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
          >
            Browse active draws
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      )}
    </Card>
  );
}