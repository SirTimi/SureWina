'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Hash, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import { Button, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { WinnerNotification } from '@surewina/types';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';

interface WinnerNotificationViewProps {
  claimId: string;
}

export function WinnerNotificationView({ claimId }: WinnerNotificationViewProps) {
  const [notification, setNotification] = useState<WinnerNotification | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.claims
      .getWinnerNotification(claimId)
      .then((res) => setNotification(res.notification))
      .catch((err) => setError(err.message ?? 'Could not load winner notification.'));
  }, [claimId]);

  if (error) {
    return (
      <Container size="md" className="py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-navy-950">Notification not found</h1>
        <p className="mt-2 text-slate-500">{error}</p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="primary">Back to home</Button>
        </Link>
      </Container>
    );
  }

  if (!notification) {
    return (
      <Container size="md" className="py-16">
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
      </Container>
    );
  }

  const isJackpot = notification.drawType === 'SATURDAY_JACKPOT';

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-950 to-[#08152a] text-white">
      {/* Confetti pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute left-[8%] top-[12%] h-2 w-2 rotate-12 rounded-sm bg-amber-500" />
        <div className="absolute left-[18%] top-[34%] h-1.5 w-3 rotate-45 rounded-sm bg-amber-400" />
        <div className="absolute left-[28%] top-[18%] h-2 w-2 rotate-12 rounded-sm bg-violet-400" />
        <div className="absolute right-[14%] top-[22%] h-2 w-2 -rotate-12 rounded-sm bg-amber-500" />
        <div className="absolute right-[24%] top-[42%] h-1.5 w-3 rotate-12 rounded-sm bg-amber-400" />
        <div className="absolute right-[8%] top-[64%] h-2 w-2 -rotate-45 rounded-sm bg-violet-400" />
        <div className="absolute left-[48%] top-[8%] h-1.5 w-3 rotate-12 rounded-sm bg-amber-500" />
      </div>

      <div className="pointer-events-none absolute right-[-20%] top-[10%] h-[600px] w-[600px] rounded-full bg-amber-50 blur-3xl" />
      <div className="pointer-events-none absolute left-[-10%] top-[50%] h-[400px] w-[400px] rounded-full bg-amber-500/10 blur-3xl" />

      <Container size="md" className="relative z-10 max-w-[820px] py-16 lg:py-24">
        {/* Pill */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-amber-300/20 bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-sm font-bold uppercase tracking-[0.18em] text-navy-950 shadow-[0_8px_30px_rgba(245,158,11,0.25)]">
          <Sparkles className="h-4 w-4" />
          You won
        </div>

        <h1 className="font-display text-5xl font-black leading-[1.02] tracking-[-0.04em] sm:text-6xl">
          Congratulations.
        </h1>
        <p className="mt-3 font-display text-3xl font-bold text-amber-400 sm:text-4xl">
          You won {drawTypeShortLabel[notification.drawType].toLowerCase()}.
        </p>

        <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
          Drawn at {formatDrawTime(notification.drawnAt)}, {formatDrawDate(notification.drawnAt)}.
          Your ticket reference matched the winning seed. This page is your proof — keep the link
          safe.
        </p>

        {/* Prize card */}
        <div className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="border-b border-white/10 px-6 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">
            Your prize
          </div>

          <div className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-[160px_1fr] sm:items-center">
            <div className="flex aspect-square items-center justify-center rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-4">
              {notification.prizeImageUrl ? (
                <img
                  src={notification.prizeImageUrl}
                  alt={notification.prizeDescription}
                  className="h-full w-full object-contain"
                />
              ) : (
                <Trophy className="h-16 w-16 text-amber-400" />
              )}
            </div>

            <div>
              <h2 className="font-display text-2xl font-bold leading-tight">
                {notification.prizeDescription}
              </h2>
              <p className="mt-2 text-sm text-white/60">
                {isJackpot
                  ? 'Guaranteed cash prize · paid to verified bank account within 24 hours of KYC clearance'
                  : 'Brand new, sealed retail · shipped or collected within 3 working days'}
              </p>
              <p className="mt-4 font-display text-3xl font-black text-amber-400">
                Value {formatNaira(notification.grossPrizeValueNgn)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 border-t border-white/10 px-6 py-5 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                Winning ticket
              </p>
              <p className="mt-2 font-mono text-lg tracking-wider text-white">
                {notification.ticketRef}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                Seed hash
              </p>
              <p className="mt-2 truncate font-mono text-sm text-white/80">
                {notification.seedHash.slice(0, 16)}…
              </p>
            </div>
          </div>
        </div>

        {/* Next: claim */}
        <div className="mt-8 overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-400/15 via-amber-400/8 to-transparent p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
            Next · claim your prize
          </p>
          <h3 className="mt-2 font-display text-xl font-bold leading-snug">
            We&apos;ll call you within 4 hours on +234 ••• ••• {notification.buyerPhoneLast4} to
            verify ID.
          </h3>
          <p className="mt-2 text-sm text-white/70">
            Choose product fulfilment or cash conversion next. Your selection deadline is{' '}
            {formatDrawDate(notification.selectionDeadlineAt)}.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href={`/claim/${notification.claimId}`}>
              <Button
                variant="accent"
                size="lg"
                className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 shadow-[0_16px_34px_rgba(14,42,71,0.18)] hover:!border-transparent hover:bg-amber-400"
              >
                Claim my prize
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

            <Link href={`/results/${notification.drawCode}`}>
              <Button
                variant="secondary"
                size="lg"
                className="rounded-sm border-white/20 bg-white/10 font-bold text-white backdrop-blur hover:bg-white/15"
              >
                <Hash className="h-4 w-4" />
                Verify draw seed
              </Button>
            </Link>
          </div>
        </div>

        {/* Trust footer */}
        <div className="mt-10 flex flex-col items-center gap-3 border-t border-white/10 pt-8 text-center sm:flex-row sm:justify-center sm:gap-6">
          <div className="inline-flex items-center gap-2 text-xs text-white/60">
            <ShieldCheck className="h-4 w-4 text-amber-400" />
            Licensed by NLRC · Licence #NL/2025/0241
          </div>
          <span className="hidden text-white/20 sm:inline">·</span>
          <p className="text-xs text-white/50">
            Winner privacy is a hard rule. We never publish names — only ticket references.
          </p>
        </div>
      </Container>
    </section>
  );
}