'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, Gift, Loader2, WalletCards } from 'lucide-react';
import { formatNaira, getAllStatesSorted } from '@surewina/utils';
import type { JackpotOfferView } from '@surewina/types';
import type { WalletView } from '@surewina/api-client';
import { api } from '@/lib/api';
import { isSignedIn } from '@/lib/auth';

export function JackpotOfferCheckout({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [offer, setOffer] = useState<JackpotOfferView | null>(null);
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [email, setEmail] = useState('');
  const [stateOfPlayCode, setStateOfPlayCode] = useState('');
  const [method, setMethod] = useState<'PAYSTACK' | 'WALLET'>('PAYSTACK');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<string | null>(null);
  const states = getAllStatesSorted();

  useEffect(() => {
    const signed = isSignedIn();
    setSignedIn(signed);
    if (!signed) {
      setLoading(false);
      return;
    }
    void Promise.all([
      api.jackpotOffers.get(offerId),
      api.wallet.getMine().catch(() => null),
      api.auth.getMe(),
    ])
      .then(([result, walletResult, user]) => {
        setOffer(result);
        setWallet(walletResult);
        setEmail(user.email ?? '');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not load the jackpot offer.');
      })
      .finally(() => setLoading(false));
  }, [offerId]);

  if (signedIn === false) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <Gift className="mx-auto mb-4 h-10 w-10 text-amber-700" />
        <h1 className="font-display text-2xl font-black text-navy-950">
          Sign in to claim your jackpot offer
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Use the phone number that purchased the regular tickets so we can verify ownership.
        </p>
        <Link
          href={`/sign-in?next=${encodeURIComponent(`/jackpot-offers/${offerId}/checkout`)}`}
          className="mt-6 inline-block rounded-xl bg-navy-800 px-6 py-3 text-sm font-bold text-white"
        >
          Sign in securely
        </Link>
      </div>
    );
  }

  const eligible =
    offer &&
    (offer.status === 'AVAILABLE' || offer.status === 'CLAIMING') &&
    Date.parse(offer.expiresAt) > Date.now();

  const pay = async () => {
    if (!offer || !eligible || busy || !stateOfPlayCode) {
      setError('Select your state of play before continuing.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (method === 'WALLET') {
        if (!wallet || wallet.status !== 'ACTIVE' || wallet.availableNgn < offer.offerPriceNgn) {
          throw new Error('Your wallet balance is insufficient. Please top up or use Paystack.');
        }
        if (!attempt.current) attempt.current = `promo-wallet-${crypto.randomUUID()}`;
        const purchased = await api.jackpotOffers.purchaseWithWallet(offerId, {
          stateOfPlayCode,
          idempotencyKey: attempt.current,
        });

        const params = new URLSearchParams({
          refs: purchased.ticketRefs.join(','),
          draw: purchased.drawCode,
          paid: String(purchased.amountNgn),
          scheduled: purchased.drawScheduledAt,
        });
        router.push(`/tickets/confirmation?${params.toString()}`);
        return;
      }

      const initialized = await api.jackpotOffers.purchaseWithPaystack(offerId, {
        stateOfPlayCode,
        ...(email.trim() ? { buyerEmail: email.trim() } : {}),
      });
      window.location.assign(initialized.authorizationUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start your jackpot purchase.');
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-3xl bg-white p-12 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Verifying your jackpot offer…
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-700">
        <Gift className="h-5 w-5" />
        Exclusive Sure Jackpot offer
      </div>
      <h1 className="mt-4 font-display text-3xl font-black text-navy-950">
        Your discounted jackpot ticket
      </h1>
      {offer && (
        <>
          <div className="mt-6 rounded-2xl bg-amber-50 p-5">
            <div className="text-3xl font-black text-navy-950">
              {formatNaira(offer.offerPriceNgn)}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              One Sure Jackpot ticket instead of{' '}
              <span className="line-through">{formatNaira(offer.originalPriceNgn)}</span>
            </p>
            <p className="mt-3 text-xs text-slate-600">
              Draw: {offer.jackpotDrawCode} · Available until{' '}
              {new Date(offer.expiresAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })} WAT
            </p>
          </div>
          {eligible && (
            <>
              <label className="mt-6 block text-sm font-bold text-navy-950" htmlFor="promo-state">
                Your state of play
              </label>
              <select
                id="promo-state"
                value={stateOfPlayCode}
                onChange={(event) => setStateOfPlayCode(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-navy-950"
              >
                <option value="">Select your state</option>
                {states.map((state) => (
                  <option key={state.code} value={state.code}>{state.name}</option>
                ))}
              </select>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMethod('PAYSTACK')}
                  aria-pressed={method === 'PAYSTACK'}
                  className={`flex items-center gap-2 rounded-xl border p-4 text-sm font-bold ${method === 'PAYSTACK' ? 'border-navy-800 bg-lime-50 text-navy-950' : 'border-slate-200 text-slate-600'}`}
                >
                  <CreditCard className="h-5 w-5" /> Pay with Paystack
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('WALLET')}
                  aria-pressed={method === 'WALLET'}
                  className={`flex items-center gap-2 rounded-xl border p-4 text-sm font-bold ${method === 'WALLET' ? 'border-navy-800 bg-lime-50 text-navy-950' : 'border-slate-200 text-slate-600'}`}
                >
                  <WalletCards className="h-5 w-5" />
                  Wallet {wallet ? `(${formatNaira(wallet.availableNgn)})` : ''}
                </button>
              </div>
              {method === 'WALLET' && (!wallet || wallet.availableNgn < offer.offerPriceNgn) && (
                <p className="mt-3 text-sm text-amber-800">
                  Insufficient wallet balance.{' '}
                  <Link className="font-bold underline" href="/dashboard/wallet">
                    Top up wallet
                  </Link>{' '}
                  or select Paystack.
                </p>
              )}
              <button
                type="button"
                disabled={busy || !stateOfPlayCode || (method === 'WALLET' && (!wallet || wallet.status !== 'ACTIVE' || wallet.availableNgn < offer.offerPriceNgn))}
                onClick={() => void pay()}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Buy one jackpot ticket for {formatNaira(offer.offerPriceNgn)}
              </button>
            </>
          )}
          {!eligible && (
            <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              This offer is no longer available for a new purchase ({offer.status.toLowerCase()}).
            </p>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      <p className="mt-5 text-xs text-slate-500">
        This is a separate purchase. You will only be charged after you complete Paystack checkout or confirm your wallet purchase.
      </p>
    </div>
  );
}
