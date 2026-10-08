'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift, Loader2 } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { JackpotOfferView } from '@surewina/types';
import { api } from '@/lib/api';
import { isSignedIn } from '@/lib/auth';

const claimPath = '/jackpot-offers/claim';

export function VerifiedJackpotOffers() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [offers, setOffers] = useState<JackpotOfferView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const signed = isSignedIn();
    setSignedIn(signed);
    if (!signed) {
      setLoading(false);
      return;
    }

    // The backend binds agent-created offers to the verified OTP phone,
    // and never exposes an offer list by unverified phone input.
    void api.jackpotOffers.current()
      .then((result) => {
        if (active) setOffers(result.offers);
      })
      .catch(() => {
        if (active) setError('Could not verify your current offers. Please sign in again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
      <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
        <Gift className="h-5 w-5" />
        Sure Jackpot offers
      </div>
      <h1 className="mt-3 font-display text-3xl font-black text-navy-950">
        Verify your phone to view your offers
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Offers are private to the phone number used for your ticket purchases.
        Viewing an offer does not buy a ticket or charge your wallet.
      </p>

      {loading && (
        <p className="mt-6 flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your account…
        </p>
      )}
      {!loading && signedIn === false && (
        <Link
          href={`/sign-in?next=${encodeURIComponent(claimPath)}`}
          className="mt-6 inline-block rounded-xl bg-navy-800 px-6 py-3 text-sm font-bold text-white"
        >
          Verify my phone
        </Link>
      )}
      {!loading && signedIn && error && (
        <div className="mt-5 space-y-3">
          <p role="alert" className="text-sm text-red-700">{error}</p>
          <Link
            href={`/sign-in?next=${encodeURIComponent(claimPath)}`}
            className="text-sm font-semibold text-navy-700 underline"
          >
            Sign in again
          </Link>
        </div>
      )}
      {!loading && signedIn && !error && offers.length === 0 && (
        <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          No currently available offers are linked to your verified number.
          Earlier offers may have expired or already been used.
        </p>
      )}
      {!loading && signedIn && !error && offers.map((offer) => (
        <article key={offer.offerId} className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex justify-between gap-3">
            <h2 className="font-semibold text-navy-950">{offer.jackpotDrawCode}</h2>
            <span className="text-xs font-bold text-amber-800">{offer.status}</span>
          </div>
          <p className="mt-2 text-sm text-slate-700">
            Offer price {formatNaira(offer.offerPriceNgn)} instead of{' '}
            <span className="line-through">{formatNaira(offer.originalPriceNgn)}</span>
          </p>
          <p className="mt-2 text-xs text-slate-600">
            Expires {new Date(offer.expiresAt).toLocaleString('en-NG', {
              timeZone: 'Africa/Lagos',
              dateStyle: 'medium',
              timeStyle: 'short',
            })} WAT
          </p>
          <Link
            href={`/jackpot-offers/${offer.offerId}/checkout`}
            className="mt-4 inline-block rounded-xl bg-navy-800 px-5 py-3 text-sm font-bold text-white"
          >
            View offer details
          </Link>
        </article>
      ))}
    </section>
  );
}
