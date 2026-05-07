'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  CreditCard,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { Button, Container } from '@surewina/ui';
import { getAllStatesSorted } from '@surewina/utils';
import type { ClaimPath, CollectionPoint } from '@surewina/types';
import { api } from '@/lib/api';

interface ClaimProductViewProps {
  claimId: string;
}

const REQUIRED_DOCS = [
  { icon: CreditCard, text: 'Government-issued photo ID (NIN, voter card, driver licence, or passport)' },
  { icon: Phone, text: 'The phone number you used to buy the ticket — we send a code on arrival' },
  { icon: Package, text: 'Original SMS receipt with your ticket reference' },
  { icon: ShieldCheck, text: 'Yourself — collection is in person, not by proxy' },
];

export function ClaimProductView({ claimId }: ClaimProductViewProps) {
  const router = useRouter();
  const states = useMemo(() => getAllStatesSorted(), []);
  const [claim, setClaim] = useState<ClaimPath | null>(null);
  const [points, setPoints] = useState<CollectionPoint[]>([]);
  const [stateFilter, setStateFilter] = useState<string>('');
  const [selectedPointId, setSelectedPointId] = useState<string>('');
  const [preferredDate, setPreferredDate] = useState<string>(getDefaultDate());
  const [agreedToPhotoOp, setAgreedToPhotoOp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookingDone, setBookingDone] = useState(false);

  useEffect(() => {
    Promise.all([
      api.claims.getClaimPath(claimId).then((res) => res.claim),
      api.claims.listCollectionPoints().then((res) => res.points),
    ])
      .then(([c, p]) => {
        setClaim(c);
        setPoints(p);
      })
      .catch((err) => setError(err.message ?? 'Could not load booking page.'));
  }, [claimId]);

  // Refetch when state filter changes
  useEffect(() => {
    if (!claim) return;
    api.claims
      .listCollectionPoints({ stateCode: stateFilter || undefined })
      .then((res) => {
        setPoints(res.points);
        // Clear selection if it's no longer in the list
        if (selectedPointId && !res.points.find((p) => p.id === selectedPointId)) {
          setSelectedPointId('');
        }
      });
  }, [stateFilter]);

  const handleBook = async () => {
    if (!selectedPointId) {
      setError('Pick a collection centre.');
      return;
    }
    if (claim?.isJackpot && !agreedToPhotoOp) {
      setError('Please confirm you agree to the photo-op for jackpot prizes.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.claims.bookCollection({
        claimId,
        collectionPointId: selectedPointId,
        preferredDate,
      });
      setBookingDone(true);
      setTimeout(() => router.push(`/claim/${claimId}/status`), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not book collection.');
      setSubmitting(false);
    }
  };

  if (error && !claim) {
    return (
      <Container size="md" className="py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-navy-950">Claim not found</h1>
        <p className="mt-2 text-slate-500">{error}</p>
        <Link href="/dashboard/claims" className="mt-6 inline-block">
          <Button variant="primary">Back to my claims</Button>
        </Link>
      </Container>
    );
  }

  if (!claim) {
    return (
      <Container size="md" className="py-16">
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
      </Container>
    );
  }

  if (bookingDone) {
    return (
      <Container size="sm" className="py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#A8E368]/30">
          <Check className="h-10 w-10 text-[#4E8F01]" />
        </div>
        <h1 className="font-display text-3xl font-black text-navy-950">Collection booked.</h1>
        <p className="mt-3 text-slate-600">
          We sent the booking confirmation by SMS. Redirecting to your claim status…
        </p>
      </Container>
    );
  }

  const selectedPoint = points.find((p) => p.id === selectedPointId);

  return (
    <Container size="lg" className="max-w-[1180px] py-10">
      <Link
        href={`/claim/${claimId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-[#4E8F01]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to claim chooser
      </Link>

      <div className="mb-8 max-w-2xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
          <Package className="h-3.5 w-3.5" />
          Step 2 · Book your collection
        </div>
        <h1 className="font-display text-4xl font-black leading-tight tracking-[-0.02em] text-navy-950 sm:text-5xl">
          Pick a collection centre.
        </h1>
        <p className="mt-3 text-base text-slate-600">
          Your prize ({claim.prizeDescription}) is ready. Choose where and when to pick it up. We
          recommend booking within 7 days of the draw.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT: pickers */}
        <div className="space-y-6">
          {/* State filter */}
          <div>
            <label
              htmlFor="state-filter"
              className="mb-2 block text-sm font-bold text-navy-950"
            >
              Filter by state
            </label>
            <select
              id="state-filter"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-navy-950 outline-none transition focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/40"
            >
              <option value="">All states ({points.length})</option>
              {states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Collection points */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Available centres
            </p>
            {points.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
                <MapPin className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">
                  No centres in this state. Try a different state or contact us — we&apos;ll
                  arrange courier delivery.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {points.map((p) => {
                  const isSelected = p.id === selectedPointId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPointId(p.id)}
                      className={`w-full rounded-2xl border-2 bg-white p-5 text-left transition-all ${
                        isSelected
                          ? 'border-[#4E8F01] shadow-[0_18px_50px_rgba(78,143,1,0.15)]'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              isSelected
                                ? 'bg-[#A8E368]/30 text-[#4E8F01]'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <MapPin className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-navy-950">{p.name}</h3>
                            <p className="mt-1 text-sm text-slate-600">{p.address}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {p.city} · {p.openingHours}
                            </p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4E8F01] text-white">
                            <Check className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Date picker */}
          <div>
            <label
              htmlFor="preferred-date"
              className="mb-2 block text-sm font-bold text-navy-950"
            >
              Preferred collection date
            </label>
            <div className="relative max-w-xs">
              <Calendar className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="preferred-date"
                type="date"
                value={preferredDate}
                min={getDefaultDate()}
                max={getMaxDate()}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-navy-950 outline-none transition focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/40"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Choose a date within the next 7 days. We&apos;ll confirm the exact time slot by SMS.
            </p>
          </div>

          {/* Photo-op T&C if jackpot */}
          {claim.isJackpot && (
            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <Camera className="h-5 w-5 shrink-0 text-amber-700" />
                <div className="flex-1">
                  <h3 className="font-bold text-navy-950">Jackpot photo-op required</h3>
                  <p className="mt-1 text-sm text-slate-700">
                    For jackpot wins, we ask one short photo at handover for our public results
                    archive. Your face is optional — most winners prefer the photo to focus on the
                    cheque.
                  </p>
                  <label className="mt-3 inline-flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedToPhotoOp}
                      onChange={(e) => setAgreedToPhotoOp(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-[#4E8F01] accent-[#4E8F01]"
                    />
                    <span className="text-slate-700">
                      I understand and agree to the photo-op terms.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-sm text-rose-900">{error}</p>
            </div>
          )}

          <Button
            onClick={handleBook}
            isLoading={submitting}
            disabled={!selectedPointId || submitting}
            variant="accent"
            size="lg"
            className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 shadow-[0_16px_34px_rgba(78,143,1,0.22)] hover:!border-transparent hover:bg-[#B7EF79]"
          >
            Confirm booking
          </Button>
        </div>

        {/* RIGHT: what to bring */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                What to bring on collection day
              </p>
            </div>
            <ul className="space-y-3 p-5">
              {REQUIRED_DOCS.map((d, i) => {
                const Icon = d.icon;
                return (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#4E8F01]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm leading-snug text-slate-700">{d.text}</span>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
              <p className="text-xs text-slate-500">
                Don&apos;t worry — we&apos;ll send a confirmation SMS with these instructions.
                Forward it to anyone helping with logistics.
              </p>
            </div>
          </div>

          {selectedPoint && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                Booking summary
              </p>
              <h3 className="mt-2 text-sm font-bold text-navy-950">{selectedPoint.name}</h3>
              <p className="mt-1 text-xs text-slate-600">{selectedPoint.address}</p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                Preferred date
              </p>
              <p className="mt-1 text-sm font-bold text-navy-950">
                {new Date(preferredDate).toLocaleDateString('en-NG', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          )}
        </aside>
      </div>
    </Container>
  );
}

function getDefaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function getMaxDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}