'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Gift, Loader2 } from 'lucide-react';
import { formatPhoneForDisplay, isValidNigerianPhone, normalizePhone } from '@surewina/utils';
import type { JackpotWeeklyProgress } from '@surewina/types';
import { api } from '@/lib/api';

interface Props {
  signedIn: boolean;
  accountPhone: string | null;
  purchasePhone: string;
  signInReturnPath: string;
}

export function JackpotWeeklyProgressCard({
  signedIn,
  accountPhone,
  purchasePhone,
  signInReturnPath,
}: Props) {
  const [progress, setProgress] = useState<JackpotWeeklyProgress | null>(null);
  const currentPhoneRef = useRef(accountPhone);
  currentPhoneRef.current = accountPhone;
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadProgress = useCallback(async () => {
    if (!signedIn || !accountPhone) return;
    setLoading(true);
    setFailed(false);
    try {
      const result = await api.jackpotOffers.progress();
      if (currentPhoneRef.current === accountPhone) setProgress(result);
    } catch {
      // Never invent a progress figure after an API/auth failure.
      if (currentPhoneRef.current === accountPhone) {
        setProgress(null);
        setFailed(true);
      }
    } finally {
      if (currentPhoneRef.current === accountPhone) setLoading(false);
    }
  }, [signedIn, accountPhone]);

  useEffect(() => {
    if (!signedIn || !accountPhone) {
      setProgress(null);
      return;
    }
    setProgress(null);
    void loadProgress();

    // If a customer returns from another tab/payment, read the fresh
    // server cycle again, rather than keeping stale progress in memory.
    const refresh = () => void loadProgress();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accountPhone, signedIn, loadProgress]);

  const matchesAccount =
    !purchasePhone ||
    (isValidNigerianPhone(purchasePhone) &&
      normalizePhone(purchasePhone) === accountPhone);

  return (
    <section
      aria-label="Your weekly jackpot offer progress"
      className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-800">
        <Gift className="h-4 w-4" />
        Weekly Sure Jackpot progress
      </div>

      {!signedIn ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          Sign in with your purchase phone number to see your verified weekly count.{' '}
          <Link
            href={`/sign-in?next=${encodeURIComponent(signInReturnPath)}`}
            className="font-bold text-navy-700 underline"
          >
            View my progress
          </Link>
          . You can still purchase regular tickets as a guest.
        </p>
      ) : !accountPhone ? (
        <p className="mt-3 text-sm text-slate-600">
          Loading your account progress…
        </p>
      ) : !matchesAccount ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          Your verified progress belongs to {formatPhoneForDisplay(accountPhone)}.
          Enter that phone number to see it here. Purchases for a different
          phone are counted toward that phone&apos;s own weekly total.
        </p>
      ) : loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your current jackpot cycle…
        </p>
      ) : failed ? (
        <div className="mt-3 text-sm text-slate-600">
          Could not verify your progress right now.{' '}
          <button type="button" className="font-bold text-navy-700 underline" onClick={() => void loadProgress()}>
            Retry
          </button>
        </div>
      ) : progress && !progress.promotionActive ? (
        <p className="mt-3 text-sm text-slate-700">
          No Saturday jackpot promotion is active right now.
          Your next weekly cycle will begin when a jackpot draw opens.
        </p>
      ) : progress ? (
        <>
          <p className="mt-3 text-sm font-semibold text-navy-950">
            You&apos;ve bought {progress.weeklyTicketCount} regular ticket{progress.weeklyTicketCount === 1 ? '' : 's'} this week.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            Buy <strong>{progress.ticketsToNextOffer} more</strong> and unlock one Sure Jackpot ticket for <strong>₦500</strong>.
          </p>
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-amber-100"
            role="progressbar"
            aria-valuenow={progress.weeklyTicketCount - progress.completedThresholds * 10}
            aria-valuemin={0}
            aria-valuemax={10}
            aria-label="Progress toward next discounted jackpot ticket"
          >
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${(progress.weeklyTicketCount - progress.completedThresholds * 10) * 10}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-slate-600">
            {progress.completedThresholds} milestone{progress.completedThresholds === 1 ? '' : 's'} reached
            {' · '}{progress.availableOfferCount} available ₦500 offer{progress.availableOfferCount === 1 ? '' : 's'}
            {progress.jackpotDrawCode ? ` · ${progress.jackpotDrawCode}` : ''}
          </p>
        </>
      ) : null}
    </section>
  );
}
