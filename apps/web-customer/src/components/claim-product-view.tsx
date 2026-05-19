'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
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
import { Button, Card, Container } from '@surewina/ui';
import { getAllStatesSorted } from '@surewina/utils';
import type { ClaimPath, CollectionPoint } from '@surewina/types';
import { api } from '@/lib/api';

interface ClaimProductViewProps {
  claimId: string;
}

const REQUIRED_DOCS = [
  {
    icon: CreditCard,
    text: 'Government-issued photo ID such as NIN, voter card, driver licence, or passport.',
  },
  {
    icon: Phone,
    text: 'The phone number used to buy the ticket. We send a code when you arrive.',
  },
  {
    icon: Package,
    text: 'Original SMS receipt with your ticket reference.',
  },
  {
    icon: ShieldCheck,
    text: 'Collection must be in person. No proxy pickup.',
  },
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
      .then(([claimData, collectionPoints]) => {
        setClaim(claimData);
        setPoints(collectionPoints);
      })
      .catch((err) => setError(err.message ?? 'Could not load booking page.'));
  }, [claimId]);

  useEffect(() => {
    if (!claim) return;

    api.claims
      .listCollectionPoints({ stateCode: stateFilter || undefined })
      .then((res) => {
        setPoints(res.points);

        if (
          selectedPointId &&
          !res.points.find((point) => point.id === selectedPointId)
        ) {
          setSelectedPointId('');
        }
      })
      .catch((err) => setError(err.message ?? 'Could not load collection centres.'));
  }, [claim, stateFilter, selectedPointId]);

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
      <main className="min-h-screen bg-[#F8FAF4]">
        <Container size="sm" className="py-20 text-center">
          <Card
            variant="default"
            className="rounded-2xl border-red-100 bg-white p-8 shadow-sm"
          >
            <AlertCircle className="mx-auto h-8 w-8 text-red-600" />

            <h1 className="mt-4 font-display text-2xl font-black text-navy-950">
              Claim not found
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-slate-500">{error}</p>

            <Link href="/dashboard/claims" className="mt-6 inline-block">
              <Button
                variant="accent"
                className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
              >
                Back to my claims
              </Button>
            </Link>
          </Card>
        </Container>
      </main>
    );
  }

  if (!claim) {
    return (
      <main className="min-h-screen bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1240px] pb-12 pt-28">
          <div className="h-[520px] animate-pulse rounded-3xl bg-white" />
        </Container>
      </main>
    );
  }

  if (bookingDone) {
    return (
      <main className="min-h-screen bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1240px] pb-12 pt-28">
          <div className="grid min-h-[520px] place-items-center">
            <Card
              variant="default"
              className="w-full max-w-2xl overflow-hidden rounded-3xl border-slate-200 bg-white text-center shadow-sm"
            >
              <div className="relative overflow-hidden bg-navy-800 px-8 py-10 text-white">
                <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-50 blur-3xl" />
                <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-white/10 blur-3xl" />

                <div className="relative">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-navy-700">
                    <Check className="h-8 w-8" />
                  </div>

                  <p className="mt-6 text-[10px] font-black uppercase tracking-[0.16em] text-amber-400">
                    Booking confirmed
                  </p>

                  <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.04em] text-white">
                    Collection booked.
                  </h1>

                  <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/75">
                    We sent your booking confirmation by SMS. You’ll be redirected to your
                    claim status shortly.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <SuccessCell label="Next step" value="Check status" />
                <SuccessCell label="Confirmation" value="Sent by SMS" />
                <SuccessCell label="Collection" value="Bring valid ID" />
              </div>

              <div className="flex flex-col items-center justify-center gap-3 border-t border-slate-100 bg-white px-6 py-5 sm:flex-row">
                <Link href={`/claim/${claimId}/status`}>
                  <Button
                    variant="accent"
                    className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
                  >
                    View claim status
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>

                <Link
                  href="/dashboard/claims"
                  className="text-sm font-bold text-slate-500 transition hover:text-navy-700"
                >
                  Back to my claims
                </Link>
              </div>
            </Card>
          </div>
        </Container>
      </main>
    );
  }

  const selectedPoint = points.find((point) => point.id === selectedPointId);

  return (
    <main className="min-h-screen bg-[#F8FAF4]">
      <Container size="lg" className="max-w-[1240px] pb-12 pt-28">
        <Link
          href={`/claim/${claimId}`}
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to claim chooser
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0">
            <Card
              variant="default"
              className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm"
            >
              <div className="relative overflow-hidden bg-navy-800 p-7 text-white sm:p-8">
                <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-emerald-50 blur-3xl" />
                <div className="absolute -bottom-24 left-1/3 h-60 w-60 rounded-full bg-white/10 blur-3xl" />

                <div className="relative">
                  <div className="mb-7 inline-flex items-center gap-2 rounded-sm bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-navy-950">
                    <Package className="h-4 w-4" />
                    Product fulfilment
                  </div>

                  <h1 className="max-w-3xl font-display text-4xl font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl">
                    Book your collection.
                  </h1>

                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base">
                    Your prize,{' '}
                    <span className="font-bold text-white">{claim.prizeDescription}</span>,
                    is ready. Choose a collection centre and preferred pickup date.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 divide-y divide-slate-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                <SummaryCell
                  label="Prize"
                  value={claim.prizeDescription}
                  subtle="Winning item"
                />

                <SummaryCell
                  label="Collection centres"
                  value={points.length.toLocaleString()}
                  subtle={stateFilter ? 'Matching selected state' : 'Available now'}
                />

                <SummaryCell
                  label="Preferred date"
                  value={new Date(preferredDate).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                  })}
                  subtle="Confirmation comes by SMS"
                />
              </div>
            </Card>

            <Card
              variant="default"
              className="mt-6 rounded-3xl border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
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
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy-950 outline-none transition focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
                  >
                    <option value="">All states ({points.length})</option>
                    {states.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="preferred-date"
                    className="mb-2 block text-sm font-bold text-navy-950"
                  >
                    Preferred collection date
                  </label>

                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <input
                      id="preferred-date"
                      type="date"
                      value={preferredDate}
                      min={getDefaultDate()}
                      max={getMaxDate()}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm text-navy-950 outline-none transition focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
                    />
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    Choose a date within the next 7 days.
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-navy-700">
                  Available centres
                </p>

                {points.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
                    <MapPin className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm text-slate-500">
                      No centres in this state. Try a different state or contact support
                      for delivery options.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    {points.map((point, index) => {
                      const isSelected = point.id === selectedPointId;
                      const isLast = index === points.length - 1;

                      return (
                        <button
                          key={point.id}
                          type="button"
                          onClick={() => setSelectedPointId(point.id)}
                          className={
                            isLast
                              ? selectedCentreClass(isSelected, false)
                              : selectedCentreClass(isSelected, true)
                          }
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={
                                isSelected
                                  ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-navy-800 text-white'
                                  : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-slate-500'
                              }
                            >
                              {isSelected ? (
                                <Check className="h-5 w-5" />
                              ) : (
                                <MapPin className="h-5 w-5" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                <h3 className="font-bold text-navy-950">{point.name}</h3>

                                <span className="text-xs font-semibold text-slate-500">
                                  {point.openingHours}
                                </span>
                              </div>

                              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                {point.address}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">{point.city}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {claim.isJackpot && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <Camera className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />

                    <div className="flex-1">
                      <h3 className="text-sm font-black text-navy-950">
                        Jackpot photo-op required
                      </h3>

                      <p className="mt-1 text-sm leading-relaxed text-slate-700">
                        For jackpot wins, we may take a short handover photo for the public
                        results archive. Your face can be excluded if preferred.
                      </p>

                      <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={agreedToPhotoOp}
                          onChange={(e) => setAgreedToPhotoOp(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-navy-700 accent-navy-700"
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
                <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-4">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-sm leading-relaxed text-red-700">{error}</p>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  onClick={handleBook}
                  isLoading={submitting}
                  disabled={!selectedPointId || submitting}
                  variant="accent"
                  size="lg"
                  className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
                >
                  Confirm booking
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <p className="text-xs leading-relaxed text-slate-500">
                  Confirmation instructions will be sent by SMS.
                </p>
              </div>
            </Card>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Booking summary
              </p>

              {selectedPoint ? (
                <>
                  <h2 className="mt-3 font-display text-2xl font-black leading-tight text-navy-950">
                    {selectedPoint.name}
                  </h2>

                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {selectedPoint.address}
                  </p>

                  <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                    <SummaryRow label="City" value={selectedPoint.city} />
                    <SummaryRow
                      label="Date"
                      value={new Date(preferredDate).toLocaleDateString('en-NG', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    />
                    <SummaryRow label="Hours" value={selectedPoint.openingHours} />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  Select a centre to see your booking summary here.
                </p>
              )}
            </Card>

            <Card
              variant="default"
              className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                  What to bring
                </p>
              </div>

              <ul className="space-y-3 p-5">
                {REQUIRED_DOCS.map((doc, index) => {
                  const Icon = doc.icon;

                  return (
                    <li key={index} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-emerald-50 text-emerald-700">
                        <Icon className="h-4 w-4" />
                      </div>

                      <span className="text-sm leading-relaxed text-slate-600">
                        {doc.text}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="border-t border-slate-100 bg-[#F8FAF4] px-5 py-4">
                <p className="text-xs leading-relaxed text-slate-500">
                  We’ll also send these instructions by SMS after booking.
                </p>
              </div>
            </Card>

            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
                <ShieldCheck className="h-5 w-5" />
              </div>

              <p className="font-display text-xl font-black text-navy-950">
                Collection is verified.
              </p>

              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Your ticket reference and identity are checked before the prize is released.
              </p>
            </Card>
          </aside>
        </div>
      </Container>
    </main>
  );
}

function SuccessCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
        {label}
      </p>

      <p className="mt-1 text-sm font-bold text-navy-950">{value}</p>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle: string;
}) {
  return (
    <div className="p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
        {label}
      </p>

      <p className="mt-1 line-clamp-1 font-display text-xl font-black text-navy-950">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">{subtle}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-navy-950">{value}</span>
    </div>
  );
}

function selectedCentreClass(isSelected: boolean, withBorder: boolean) {
  const base =
    'block w-full bg-white px-4 py-4 text-left transition hover:bg-[#F8FAF4]';

  const border = withBorder ? ' border-b border-slate-100' : '';

  if (isSelected) {
    return `${base}${border} bg-amber-50`;
  }

  return `${base}${border}`;
}

function getDefaultDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
}

function getMaxDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().split('T')[0];
}