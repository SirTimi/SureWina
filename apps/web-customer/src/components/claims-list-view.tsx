'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy, Package, Banknote, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { DashboardClaim, PrizeClaimStatus } from '@surewina/types';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate } from '@/lib/draw-helpers';

const statusLabel: Record<PrizeClaimStatus, string> = {
  NOTIFIED: 'Awaiting your selection',
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

const statusVariant: Record<PrizeClaimStatus, 'live' | 'verified' | 'warning' | 'closed' | 'jackpot' | 'daily'> = {
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

const TIMELINE: { id: 'won' | 'selected' | 'kyc' | 'fulfilled'; label: string }[] = [
  { id: 'won', label: 'Won' },
  { id: 'selected', label: 'Selection made' },
  { id: 'kyc', label: 'KYC cleared' },
  { id: 'fulfilled', label: 'Delivered' },
];

function getTimelineProgress(status: PrizeClaimStatus, claimType: 'PRODUCT' | 'CASH' | null) {
  // Compute which steps are done, current, future
  const stepStates: Record<typeof TIMELINE[number]['id'], 'done' | 'current' | 'future'> = {
    won: 'done',
    selected: 'future',
    kyc: 'future',
    fulfilled: 'future',
  };

  if (status === 'NOTIFIED') {
    stepStates.selected = 'current';
    return stepStates;
  }

  stepStates.selected = 'done';

  if (claimType === 'PRODUCT') {
    // Product path skips KYC
    if (status === 'SELECTION_MADE' || status === 'PRODUCT_BOOKED') {
      stepStates.kyc = 'done';
      stepStates.fulfilled = 'current';
    } else if (status === 'DISPATCHED') {
      stepStates.kyc = 'done';
      stepStates.fulfilled = 'current';
    } else if (status === 'DELIVERED') {
      stepStates.kyc = 'done';
      stepStates.fulfilled = 'done';
    }
  } else if (claimType === 'CASH') {
    if (status === 'KYC_PENDING') stepStates.kyc = 'current';
    else if (status === 'KYC_CLEARED') {
      stepStates.kyc = 'done';
      stepStates.fulfilled = 'current';
    } else if (status === 'CASH_PAID') {
      stepStates.kyc = 'done';
      stepStates.fulfilled = 'done';
    }
  }

  if (status === 'FORFEITED') {
    stepStates.selected = 'done';
    stepStates.kyc = 'future';
    stepStates.fulfilled = 'future';
  }

  return stepStates;
}

function formatDeadline(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Past deadline';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  return `${hours} hour${hours === 1 ? '' : 's'} left`;
}

export function ClaimsListView() {
  const [claims, setClaims] = useState<DashboardClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard
      .listMyClaims()
      .then((res) => setClaims(res.claims))
      .catch((err) => setError(err.message ?? 'Could not load claims.'));
  }, []);

  if (error) {
    return (
      <Card variant="default" className="p-8 text-center">
        <p className="text-danger font-medium">{error}</p>
      </Card>
    );
  }

  if (!claims) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-40 bg-ink-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <Card variant="default">
        <EmptyState
          icon={<Trophy className="w-12 h-12" />}
          title="No prizes claimed yet"
          description="When you win a draw, your prize claim will appear here. We'll guide you through choosing product or cash, and track every step until your prize is delivered."
          action={
            <Link href="/">
              <Button variant="primary">Browse active draws</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  // Sort: in-progress first, then completed by most recent
  const sorted = [...claims].sort((a, b) => {
    const aActive = a.fulfilledAt === null;
    const bActive = b.fulfilledAt === null;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return b.drawDate.localeCompare(a.drawDate);
  });

  return (
    <div className="space-y-4">
      {sorted.map((claim) => (
        <ClaimCard key={claim.claimId} claim={claim} />
      ))}
    </div>
  );
}

function ClaimCard({ claim }: { claim: DashboardClaim }) {
  const isJackpot = claim.drawType === 'SATURDAY_JACKPOT';
  const isProduct = claim.claimType === 'PRODUCT';
  const isCash = claim.claimType === 'CASH';
  const isComplete = claim.fulfilledAt !== null;
  const isForfeited = claim.status === 'FORFEITED';
  const stepStates = getTimelineProgress(claim.status, claim.claimType);

  return (
    <Card id={claim.claimId} variant="default" className="overflow-hidden">
      <div className="p-6 border-b border-ink-100">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
              {drawTypeShortLabel[claim.drawType]}
            </Badge>
            <Badge variant={statusVariant[claim.status]} withDot={!isComplete && !isForfeited}>
              {statusLabel[claim.status]}
            </Badge>
            {isProduct && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-500">
                <Package className="w-3 h-3" />
                Product
              </span>
            )}
            {isCash && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-500">
                <Banknote className="w-3 h-3" />
                Cash
              </span>
            )}
          </div>
          {!isComplete && !isForfeited && (
            <span className="inline-flex items-center gap-1 text-xs text-warning font-medium tabular-nums">
              <Clock className="w-3 h-3" />
              {formatDeadline(claim.claimDeadlineAt)}
            </span>
          )}
        </div>

        <h3 className="font-display text-xl font-bold text-ink-950">
          {claim.prizeDescription}
        </h3>
        <div className="flex items-baseline gap-3 mt-2">
          <span className="font-display text-2xl font-bold text-amber-700 tabular-nums">
            {formatNaira(claim.netPrizeValueNgn)}
          </span>
          {claim.whtAmountNgn > 0 && (
            <span className="text-xs text-ink-500">
              gross {formatNaira(claim.grossPrizeValueNgn)} − WHT {formatNaira(claim.whtAmountNgn)}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-500 mt-2">
          Won {formatDrawDate(claim.drawDate)} · Ticket{' '}
          <span className="font-mono text-ink-700">{claim.ticketRef}</span>
        </p>
      </div>

      {!isForfeited && (
        <div className="p-6 bg-ink-50/30">
          <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-4">
            Claim timeline
          </p>
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            {TIMELINE.map((step, i) => {
              const state = stepStates[step.id];
              return (
                <div key={step.id} className="flex-1 flex flex-col items-center text-center">
                  <div
                    className={
                      state === 'done'
                        ? 'w-8 h-8 rounded-full bg-success text-white inline-flex items-center justify-center'
                        : state === 'current'
                        ? 'w-8 h-8 rounded-full bg-amber-500 text-white inline-flex items-center justify-center ring-4 ring-amber-100'
                        : 'w-8 h-8 rounded-full bg-white border-2 border-ink-200 inline-flex items-center justify-center'
                    }
                  >
                    {state === 'done' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : state === 'current' ? (
                      <span className="text-xs font-bold tabular-nums">{i + 1}</span>
                    ) : (
                      <span className="text-xs font-bold text-ink-300 tabular-nums">{i + 1}</span>
                    )}
                  </div>
                  <p
                    className={
                      state === 'done'
                        ? 'text-xs font-medium text-ink-950 mt-2'
                        : state === 'current'
                        ? 'text-xs font-semibold text-ink-950 mt-2'
                        : 'text-xs text-ink-300 mt-2'
                    }
                  >
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action footer */}
      {claim.status === 'NOTIFIED' && (
        <div className="p-5 border-t border-amber-100 bg-amber-50 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-ink-950">Action needed</p>
              <p className="text-ink-700 text-xs mt-0.5">
                Choose product or cash by{' '}
                {formatDrawDate(claim.selectionDeadlineAt)}.
              </p>
            </div>
          </div>
          <Link href={`/claim/${claim.claimId}`}>
            <Button variant="accent" size="md">
              Claim my prize
            </Button>
          </Link>
        </div>
      )}

      {claim.status === 'KYC_PENDING' && (
        <div className="p-5 border-t border-warning/20 bg-warning-bg flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-ink-950">Complete KYC to receive cash</p>
              <p className="text-ink-700 text-xs mt-0.5">
                Upload ID + bank account to verify.
              </p>
            </div>
          </div>
          <Link href={`/claim/${claim.claimId}/cash/kyc`}>
            <Button variant="primary" size="md">
              Complete KYC
            </Button>
          </Link>
        </div>
      )}

      {isComplete && (
        <div className="p-5 border-t border-ink-100 text-xs text-ink-500 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span>Fulfilled on {formatDrawDate(claim.fulfilledAt!)}</span>
        </div>
      )}

      {isForfeited && (
        <div className="p-5 border-t border-ink-100 text-xs text-ink-500">
          This prize was forfeited because the claim window expired without a selection.
        </div>
      )}
    </Card>
  );
}