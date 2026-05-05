'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Sparkles, Wallet } from 'lucide-react';
import { Badge, Button, Card, Container, Stat } from '@surewina/ui';
import { formatNaira, formatPhoneForDisplay } from '@surewina/utils';
import type { DashboardSummary } from '@surewina/types';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';

function formatCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Drawing now';
  const totalMins = Math.floor(ms / (60 * 1000));
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const minutes = totalMins % 60;
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface DashboardPageProps {
  searchParams?: Promise<{ welcome?: string }>;
}

export default function DashboardPage({ searchParams }: DashboardPageProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    api.dashboard
      .getSummary()
      .then(setSummary)
      .catch((err) => setError(err.message ?? 'Could not load your dashboard.'));

    if (typeof window !== 'undefined' && window.location.search.includes('welcome=1')) {
      setShowWelcome(true);
    }
  }, []);

  if (error) {
    return (
      <Container size="lg" className="py-12">
        <Card variant="default" className="p-8 text-center">
          <p className="text-danger font-medium">{error}</p>
        </Card>
      </Container>
    );
  }

  if (!summary) {
    return (
      <Container size="lg" className="py-12">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-ink-100 rounded animate-pulse" />
          <div className="h-32 bg-ink-100 rounded-lg animate-pulse" />
        </div>
      </Container>
    );
  }

  const { user, activeTicketCount, activeDrawGroups, jackpot, totalSpentMonthlyNgn, monthlyLimitNgn, lifetimeWinningsNgn, lifetimeWinCount, lastWinAt } = summary;
  const monthlySpentPercent = monthlyLimitNgn ? Math.min(100, (totalSpentMonthlyNgn / monthlyLimitNgn) * 100) : 0;

  return (
    <Container size="lg" className="py-10">
      {showWelcome && (
        <div className="mb-6 bg-success-bg border border-success/20 rounded-md p-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-sm text-ink-950">Welcome to Surewina.</p>
            <p className="text-sm text-ink-700 mt-0.5">
              Your phone is verified. You can now track tickets, see claims, and manage your account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowWelcome(false)}
            className="text-ink-500 hover:text-ink-950 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-8">
        <p className="text-sm text-ink-500">Welcome back</p>
        <h1 className="font-display text-3xl font-bold text-ink-950 mt-1">
          Hi, {user.displayName ?? formatPhoneForDisplay(user.phoneNumber)}
        </h1>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat
          label="Active tickets"
          value={activeTicketCount}
          hint={`across ${activeDrawGroups.length} draw${activeDrawGroups.length === 1 ? '' : 's'}`}
        />
        <Stat
          label="Saturday jackpot entries"
          variant="highlight"
          value={
            <>
              {jackpot.freeEntries}
              <span className="text-base text-amber-700 font-medium ml-1">/ {jackpot.freeEntries === 1 ? '1 free' : `${jackpot.freeEntries} free`}</span>
            </>
          }
          hint={
            jackpot.ticketsToNextEntry === 10
              ? `${jackpot.cumulativeCount} daily tickets earned`
              : `${jackpot.ticketsToNextEntry} more daily ticket${jackpot.ticketsToNextEntry === 1 ? '' : 's'} for next free entry`
          }
        />
        <Stat
          label={`Total spent (${new Date().toLocaleDateString('en-NG', { month: 'long' })})`}
          value={formatNaira(totalSpentMonthlyNgn)}
          hint={
            monthlyLimitNgn ? (
              <span className="block">
                of {formatNaira(monthlyLimitNgn)} monthly limit
                <span className="block mt-2 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                  <span
                    className="block h-full bg-navy-800 rounded-full"
                    style={{ width: `${monthlySpentPercent}%` }}
                  />
                </span>
              </span>
            ) : (
              <Link href="/dashboard/responsible-play" className="text-navy-800 hover:underline">
                Set a limit →
              </Link>
            )
          }
        />
        <Stat
          label="Lifetime winnings"
          value={formatNaira(lifetimeWinningsNgn)}
          hint={
            lifetimeWinCount === 0
              ? 'No wins yet — keep going'
              : `${lifetimeWinCount} prize${lifetimeWinCount === 1 ? '' : 's'} claimed${lastWinAt ? ` · ${formatDrawDate(lastWinAt).slice(0, 6)}` : ''}`
          }
        />
      </div>

      {/* Tickets section */}
      <div className="mb-6 flex items-end justify-between">
        <h2 className="font-display text-xl font-semibold text-ink-950">Your active draws</h2>
        <Link
          href="/dashboard/tickets"
          className="text-sm text-navy-800 hover:text-navy-700 font-medium"
        >
          View all tickets →
        </Link>
      </div>

      {activeDrawGroups.length === 0 ? (
        <Card variant="default" className="p-10 text-center">
          <p className="text-ink-500">No active tickets right now.</p>
          <Link href="/" className="inline-block mt-4">
            <Button variant="primary">Browse active draws</Button>
          </Link>
        </Card>
      ) : (
        <Card variant="default" className="overflow-hidden mb-8">
          {activeDrawGroups.map((group, i) => {
            const isJackpot = group.drawType === 'SATURDAY_JACKPOT';
            return (
              <Link
                key={group.drawCode}
                href={`/dashboard/tickets/${group.ticketRefs[0]}`}
                className={
                  i < activeDrawGroups.length - 1
                    ? 'flex items-center justify-between gap-4 p-5 border-b border-ink-100 hover:bg-ink-50/50 transition-colors'
                    : 'flex items-center justify-between gap-4 p-5 hover:bg-ink-50/50 transition-colors'
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
                      {drawTypeShortLabel[group.drawType]}
                    </Badge>
                    <span className="text-xs text-ink-500">
                      {formatDrawDate(group.drawScheduledAt)} · {formatDrawTime(group.drawScheduledAt)}
                    </span>
                  </div>
                  <p className="font-display font-semibold text-ink-950 truncate">
                    {group.drawPrizeDescription}
                  </p>
                  <p className="text-sm text-ink-500 mt-0.5 tabular-nums">
                    {group.ticketCount} ticket{group.ticketCount === 1 ? '' : 's'}
                    <span className="mx-1.5 text-ink-300">·</span>
                    closes in {formatCountdown(group.drawScheduledAt)}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-300 flex-shrink-0" />
              </Link>
            );
          })}
        </Card>
      )}

      {/* Jackpot accumulation banner */}
      {jackpot.ticketsToNextEntry < 10 && jackpot.ticketsToNextEntry > 0 && (
        <Card variant="dark" className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0 mt-1" />
              <div>
                <p className="font-display font-bold text-lg text-white">
                  {jackpot.ticketsToNextEntry} more ticket{jackpot.ticketsToNextEntry === 1 ? '' : 's'},{' '}
                  {jackpot.freeEntries === 0 ? 'your first free Saturday entry.' : 'one more free Saturday entry.'}
                </p>
                <p className="text-sm text-white/70 mt-1">
                  Stack daily plays into the {formatNaira(4000000)} jackpot. No subscription, no obligation.
                </p>
              </div>
            </div>
            <Link href="/" className="flex-shrink-0">
              <Button variant="accent" size="md">
                Buy daily tickets
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </Container>
  );
}