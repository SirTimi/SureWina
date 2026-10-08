'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Loader2, Sparkles } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { JackpotPromotionPrompt } from '@surewina/types';
import { api } from '@/lib/api';
import { isSignedIn } from '@/lib/auth';

interface JackpotOfferPromptProps {
  promotion: JackpotPromotionPrompt;
  purchaseReference?: string;
}

export function JackpotOfferPrompt({
  promotion,
  purchaseReference,
}: JackpotOfferPromptProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [verifiedPromotion, setVerifiedPromotion] =
    useState<JackpotPromotionPrompt | null>(null);

  const checkoutPath = `/jackpot-offers/${promotion.offerId}/checkout`;

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      try {
        let current: JackpotPromotionPrompt | null = null;
        if (purchaseReference) {
          const result = await api.tickets.getPurchaseStatus(purchaseReference);
          if (
            result.status === 'CONFIRMED' &&
            result.promotion?.offerId === promotion.offerId
          ) {
            current = result.promotion;
          }
        } else if (isSignedIn()) {
          const offer = await api.jackpotOffers.get(promotion.offerId);
          if (offer.status === 'AVAILABLE') {
            current = {
              offerId: offer.offerId,
              status: 'AVAILABLE',
              priceNgn: offer.offerPriceNgn,
              normalPriceNgn: offer.originalPriceNgn,
              expiresAt: offer.expiresAt,
              jackpotDrawCode: offer.jackpotDrawCode,
              regularTicketsAtUnlock: offer.regularTicketsAtUnlock,
            };
          }
        }

        if (!cancelled && current?.status === 'AVAILABLE' &&
            Date.parse(current.expiresAt) > Date.now()) {
          setVerifiedPromotion(current);
        }
      } catch {
        // Never present an unverified or already-redeemed offer solely
        // because its ID happens to be in the confirmation URL.
      }
    };

    void verify();
    return () => { cancelled = true; };
  }, [promotion.offerId, purchaseReference]);

  useEffect(() => {
    if (!verifiedPromotion || resolved) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [verifiedPromotion, resolved]);

  const claimNow = () => {
    if (declining) return;
    if (isSignedIn()) {
      router.push(checkoutPath);
      return;
    }

    router.push(
      `/sign-in?next=${encodeURIComponent(checkoutPath)}`,
    );
  };

  const decline = async () => {
    if (declining) return;
    setDeclining(true);
    setError(null);

    try {
      if (purchaseReference) {
        // A confirmed guest checkout reference proves this exact purchase
        // unlocked the offer. No account sign-in is required to decline it.
        await api.jackpotOffers.declineFromPurchase(
          promotion.offerId,
          purchaseReference,
        );
      } else {
        await api.jackpotOffers.decline(promotion.offerId);
      }
      dialogRef.current?.close();
      setResolved(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not save your choice. Please try again.',
      );
    } finally {
      setDeclining(false);
    }
  };

  const displayed = verifiedPromotion ?? promotion;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="jackpot-offer-title"
      aria-describedby="jackpot-offer-description"
      onCancel={(event) => event.preventDefault()}
      className="w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-3xl border-0 bg-white p-0 text-left shadow-2xl backdrop:bg-slate-950/70"
    >
      <div className="bg-gradient-to-br from-amber-50 via-white to-lime-50 px-6 pb-5 pt-8 text-center sm:px-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <Gift className="h-8 w-8 text-amber-700" />
        </div>
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-800">
          <Sparkles className="h-3.5 w-3.5" />
          Exclusive offer
        </div>
        <h2
          id="jackpot-offer-title"
          className="mt-4 font-display text-2xl font-black text-navy-950 sm:text-3xl"
        >
          🎉 Jackpot offer unlocked
        </h2>
        <p id="jackpot-offer-description" className="mt-3 text-sm leading-relaxed text-slate-600">
          You&apos;ve reached {displayed.regularTicketsAtUnlock} regular tickets this week.
          Get <strong>1 Sure Jackpot ticket</strong> for
        </p>
        <p className="mt-3 font-display text-4xl font-black tabular-nums text-navy-950">
          {formatNaira(displayed.priceNgn)}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          instead of <span className="font-semibold line-through">{formatNaira(displayed.normalPriceNgn)}</span>
        </p>
        <p className="mt-4 text-xs font-medium text-slate-500">
          Valid for {displayed.jackpotDrawCode} until{' '}
          {new Date(displayed.expiresAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })} WAT.
        </p>
      </div>

      <div className="space-y-3 px-6 pb-7 sm:px-8">
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={claimNow}
          disabled={declining}
          className="flex w-full items-center justify-center rounded-xl bg-navy-800 px-5 py-3.5 text-sm font-black text-white transition hover:bg-navy-950 disabled:opacity-60"
        >
          Claim now
        </button>
        <button
          type="button"
          onClick={decline}
          disabled={declining}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          {declining && <Loader2 className="h-4 w-4 animate-spin" />}
          No thank you
        </button>
        <p className="text-center text-xs text-slate-500">
          Claiming starts a separate, optional purchase. You have not been charged for this offer.
        </p>
      </div>
    </dialog>
  );
}
