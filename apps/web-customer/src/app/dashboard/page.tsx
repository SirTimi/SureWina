'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Gift,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
  WalletCards,
} from 'lucide-react';
import { Badge, Button, Card, Container } from '@surewina/ui';
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
      <main className="min-h-screen bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1400px] py-12">
          <Card
            variant="default"
            className="rounded-3xl border-red-100 bg-white p-8 text-center shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
          >
            <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
            <p className="mt-3 text-sm font-bold text-red-600">{error}</p>
          </Card>
        </Container>
      </main>
    );
  }

  if (!summary) {
    return (
      <main className="min-h-screen bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1400px] py-12">
          <div className="space-y-4">
            <div className="h-56 animate-pulse rounded-3xl bg-white" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="h-32 animate-pulse rounded-2xl bg-white" />
              <div className="h-32 animate-pulse rounded-2xl bg-white" />
              <div className="h-32 animate-pulse rounded-2xl bg-white" />
              <div className="h-32 animate-pulse rounded-2xl bg-white" />
            </div>
          </div>
        </Container>
      </main>
    );
  }

  const {
    user,
    activeTicketCount,
    activeDrawGroups,
    jackpot,
    totalSpentMonthlyNgn,
    monthlyLimitNgn,
    lifetimeWinningsNgn,
    lifetimeWinCount,
    lastWinAt,
  } = summary;

  const monthlySpentPercent = monthlyLimitNgn
    ? Math.min(100, (totalSpentMonthlyNgn / monthlyLimitNgn) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-[#F8FAF4]">
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(22,89,150,0.10)_0%,rgba(22,89,150,0.06)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_52%,#E8F0FB_100%)] py-10">
        <div className="absolute right-[-8%] top-1/2 hidden h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-navy-50 blur-3xl lg:block" />
        <div className="absolute bottom-[-120px] left-[18%] h-72 w-72 rounded-full bg-navy-50 blur-3xl" />

        <Container size="lg" className="relative max-w-[1400px]">
          {showWelcome && (
            <div className="mb-6 flex items-start justify-between gap-4 rounded-2xl border border-navy-100 bg-white/85 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
                  <ShieldCheck className="h-4 w-4" />
                </div>

                <div>
                  <p className="text-sm font-black text-navy-950">Welcome to Surewina.</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                    Your phone is verified. You can now track tickets, see claims, and
                    manage your account.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowWelcome(false)}
                className="text-xs font-bold text-slate-500 transition hover:text-navy-950"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-navy-700/90 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur">
                <Sparkles className="h-4 w-4 text-white" />
                Player dashboard
              </div>

              <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl">
                Hi,{' '}
                <span className="text-navy-700">
                  {user.displayName ?? formatPhoneForDisplay(user.phoneNumber)}
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-700">
                Track your active tickets, jackpot progress, responsible play limit, and
                claim history from one place.
              </p>
            </div>

            <Card
              variant="default"
              className="rounded-3xl border-navy-100 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                This month
              </p>

              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <p className="font-display text-3xl font-black tracking-[-0.04em] text-navy-950">
                    {formatNaira(totalSpentMonthlyNgn)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {monthlyLimitNgn
                      ? `of ${formatNaira(monthlyLimitNgn)} limit`
                      : 'No monthly limit set'}
                  </p>
                </div>

                <WalletCards className="h-8 w-8 text-navy-700" />
              </div>

              {monthlyLimitNgn ? (
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-navy-800"
                    style={{ width: `${monthlySpentPercent}%` }}
                  />
                </div>
              ) : (
                <Link
                  href="/dashboard/responsible-play"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
                >
                  Set a limit
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </Card>
          </div>
        </Container>
      </section>

      <Container size="lg" className="max-w-[1400px] py-10 lg:py-12">
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardMetric
            icon={<Ticket className="h-5 w-5" />}
            label="Active tickets"
            value={activeTicketCount.toLocaleString()}
            hint={`Across ${activeDrawGroups.length} draw${
              activeDrawGroups.length === 1 ? '' : 's'
            }`}
          />

          <DashboardMetric
            icon={<Sparkles className="h-5 w-5" />}
            label="Saturday jackpot entries"
            value={jackpot.freeEntries.toLocaleString()}
            hint={
              jackpot.ticketsToNextEntry === 10
                ? `${jackpot.cumulativeCount} daily tickets earned`
                : `${jackpot.ticketsToNextEntry} more daily ticket${
                    jackpot.ticketsToNextEntry === 1 ? '' : 's'
                  } for next free entry`
            }
            highlighted
          />

          <DashboardMetric
            icon={<WalletCards className="h-5 w-5" />}
            label={`Spent in ${new Date().toLocaleDateString('en-NG', {
              month: 'long',
            })}`}
            value={formatNaira(totalSpentMonthlyNgn)}
            hint={monthlyLimitNgn ? `${monthlySpentPercent.toFixed(0)}% of limit` : 'No limit set'}
          />

          <DashboardMetric
            icon={<Trophy className="h-5 w-5" />}
            label="Lifetime winnings"
            value={formatNaira(lifetimeWinningsNgn)}
            hint={
              lifetimeWinCount === 0
                ? 'No wins yet'
                : `${lifetimeWinCount} prize${lifetimeWinCount === 1 ? '' : 's'} claimed${
                    lastWinAt ? ` · ${formatDrawDate(lastWinAt).slice(0, 6)}` : ''
                  }`
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                  Active draws
                </p>
                <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
                  Your tickets in play.
                </h2>
              </div>

              <Link
                href="/dashboard/tickets"
                className="hidden text-sm font-bold text-navy-700 transition hover:text-navy-800 sm:inline-flex"
              >
                View all tickets →
              </Link>
            </div>

            {activeDrawGroups.length === 0 ? (
              <Card
                variant="default"
                className="rounded-3xl border-slate-200 bg-white p-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy-50 text-navy-700">
                  <Ticket className="h-7 w-7" />
                </div>

                <p className="mt-4 font-display text-2xl font-black text-navy-950">
                  No active tickets right now.
                </p>

                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                  Buy a ticket from any open draw and it will appear here immediately.
                </p>

                <Link href="/draws" className="mt-6 inline-block">
                  <Button
                    variant="accent"
                    className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
                  >
                    Browse active draws
                  </Button>
                </Link>
              </Card>
            ) : (
              <Card
                variant="default"
                className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
              >
                {activeDrawGroups.map((group, i) => {
                  const isJackpot = group.drawType === 'SATURDAY_JACKPOT';

                  return (
                    <Link
                      key={group.drawCode}
                      href={`/dashboard/tickets/${group.ticketRefs[0]}`}
                      className={
                        i < activeDrawGroups.length - 1
                          ? 'flex items-center justify-between gap-4 border-b border-slate-100 p-5 transition hover:bg-amber-50'
                          : 'flex items-center justify-between gap-4 p-5 transition hover:bg-amber-50'
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
                            {drawTypeShortLabel[group.drawType]}
                          </Badge>

                          <span className="text-xs font-medium text-slate-500">
                            {formatDrawDate(group.drawScheduledAt)} ·{' '}
                            {formatDrawTime(group.drawScheduledAt)}
                          </span>
                        </div>

                        <p className="truncate font-display text-lg font-black text-navy-950">
                          {group.drawPrizeDescription}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {group.ticketCount} ticket{group.ticketCount === 1 ? '' : 's'}
                          <span className="mx-1.5 text-slate-300">·</span>
                          closes in {formatCountdown(group.drawScheduledAt)}
                        </p>
                      </div>

                      <ChevronRight className="h-5 w-5 shrink-0 text-navy-700" />
                    </Link>
                  );
                })}
              </Card>
            )}
          </section>

          <aside className="space-y-4">
            <Card
              variant="default"
              className="overflow-hidden rounded-3xl border-navy-100 bg-navy-800 p-6 text-white shadow-[0_24px_70px_rgba(14,42,71,0.18)]"
            >
              <div className="inline-flex items-center gap-2 rounded-sm bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-950">
                <Gift className="h-4 w-4" />
                10-for-1 progress
              </div>

              <h3 className="mt-5 font-display text-3xl font-black tracking-[-0.04em] text-white">
                {jackpot.freeEntries} free jackpot{' '}
                {jackpot.freeEntries === 1 ? 'entry' : 'entries'}
              </h3>

              <p className="mt-3 text-sm leading-relaxed text-white/75">
                {jackpot.ticketsToNextEntry === 10
                  ? `${jackpot.cumulativeCount} daily tickets counted so far.`
                  : `${jackpot.ticketsToNextEntry} more daily ticket${
                      jackpot.ticketsToNextEntry === 1 ? '' : 's'
                    } unlocks the next free Saturday jackpot entry.`}
              </p>

              <Link href="/draws" className="mt-6 inline-block">
                <Button
                  variant="accent"
                  size="md"
                  className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
                >
                  Buy daily tickets
                </Button>
              </Link>
            </Card>

            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Responsible play
              </p>

              <h3 className="mt-2 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                Keep it controlled.
              </h3>

              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                Set a spend limit or take a break if play starts feeling like pressure.
              </p>

              <Link
                href="/dashboard/responsible-play"
                className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
              >
                Manage protection tools
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Card>
          </aside>
        </div>
      </Container>
    </main>
  );
}

function DashboardMetric({
  icon,
  label,
  value,
  hint,
  highlighted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  highlighted?: boolean;
}) {
  return (
    <Card
      variant="default"
      className={
        highlighted
          ? 'rounded-2xl border-navy-200 bg-amber-50 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)]'
          : 'rounded-2xl border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)]'
      }
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
          {icon}
        </div>

        {highlighted && (
          <span className="rounded-sm bg-navy-800 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
            Bonus
          </span>
        )}
      </div>

      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
        {label}
      </p>

      <p className="mt-2 font-display text-3xl font-black tracking-[-0.04em] text-navy-950 tabular-nums">
        {value}
      </p>

      <p className="mt-2 text-sm leading-relaxed text-slate-500">{hint}</p>
    </Card>
  );
}