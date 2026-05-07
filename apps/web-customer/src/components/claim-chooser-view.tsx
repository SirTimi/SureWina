'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Camera,
  Check,
  ChevronLeft,
  Clock,
  Package,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { Button, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { ClaimPath } from '@surewina/types';
import { api } from '@/lib/api';
import { formatDrawDate } from '@/lib/draw-helpers';

interface ClaimChooserViewProps {
  claimId: string;
}

type Path = 'PRODUCT' | 'CASH';

export function ClaimChooserView({ claimId }: ClaimChooserViewProps) {
  const router = useRouter();
  const [claim, setClaim] = useState<ClaimPath | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Path | null>(null);

  useEffect(() => {
    api.claims
      .getClaimPath(claimId)
      .then((res) => setClaim(res.claim))
      .catch((err) => setError(err.message ?? 'Could not load claim.'));
  }, [claimId]);

  const handleChoose = async (path: Path) => {
    if (!claim) return;
    setError(null);
    setSubmitting(path);
    try {
      await api.claims.chooseClaimPath({ claimId: claim.claimId, path });
      // Redirect to the next step in the path
      if (path === 'CASH') {
        router.push(`/claim/${claimId}/cash`);
      } else {
        router.push(`/claim/${claimId}/product`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your choice.');
      setSubmitting(null);
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

  return (
    <Container size="lg" className="max-w-[1180px] py-10">
      {/* Breadcrumb */}
      <Link
        href={`/winners/${claimId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-[#4E8F01]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to win notification
      </Link>

      {/* Heading */}
      <div className="mb-8 max-w-2xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          Step 1 of 3 · Choose how to claim
        </div>
        <h1 className="font-display text-4xl font-black leading-tight tracking-[-0.02em] text-navy-950 sm:text-5xl">
          How would you like to receive your prize?
        </h1>
        <p className="mt-3 text-base text-slate-600">
          You won{' '}
          <span className="font-semibold text-navy-950">{claim.prizeDescription}</span>{' '}
          (worth{' '}
          <span className="font-semibold text-navy-950 tabular-nums">
            {formatNaira(claim.grossPrizeValueNgn)}
          </span>
          ). You can take it as a product, or convert it to cash. Both are paid out by Surewina —
          no third party.
        </p>
      </div>

      {/* Two paths */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* PRODUCT */}
        <PathCard
          title="Product fulfilment"
          subtitle="We ship or you collect"
          icon={Package}
          tone="green"
          headline={claim.prizeDescription}
          headlineNote="Brand new · sealed retail · manufacturer warranty"
          payoutLabel="You receive"
          payoutValue={claim.prizeDescription}
          payoutSubvalue={`Value ${formatNaira(claim.grossPrizeValueNgn)}`}
          highlights={[
            { icon: Check, text: 'No KYC documents required' },
            { icon: Truck, text: 'Shipped within 3 working days, anywhere in Nigeria' },
            { icon: Camera, text: claim.isJackpot ? 'Photo-op on collection (jackpot only)' : 'Collect at any Surewina centre' },
            { icon: ShieldCheck, text: 'Full manufacturer warranty preserved' },
          ]}
          ctaLabel="Choose product"
          isSubmitting={submitting === 'PRODUCT'}
          onChoose={() => handleChoose('PRODUCT')}
          disabled={submitting !== null}
        />

        {/* CASH */}
        <PathCard
          title="Cash conversion"
          subtitle="Paid to your bank account"
          icon={Banknote}
          tone="amber"
          headline={formatNaira(claim.netCashIfChosenNgn)}
          headlineNote="Net amount after WHT deduction"
          payoutLabel="You receive"
          payoutValue={formatNaira(claim.netCashIfChosenNgn)}
          payoutSubvalue={`Gross ${formatNaira(claim.grossPrizeValueNgn)} − WHT ${formatNaira(claim.estimatedWhtNgn)}`}
          highlights={[
            { icon: AlertCircle, text: 'Tier 1 KYC required (NIN + selfie + BVN + bank account)' },
            { icon: Clock, text: 'Bank transfer within 24 hours of KYC clearance' },
            { icon: Banknote, text: '10% withholding tax deducted at source on prizes over ₦10,000' },
            { icon: ShieldCheck, text: 'WHT certificate generated automatically' },
          ]}
          ctaLabel="Choose cash"
          isSubmitting={submitting === 'CASH'}
          onChoose={() => handleChoose('CASH')}
          disabled={submitting !== null}
        />
      </div>

      {error && (
        <div className="mt-6 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-sm text-rose-900">{error}</p>
        </div>
      )}

      {/* Footer notes */}
      <div className="mt-10 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-6 sm:grid-cols-2">
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 shrink-0 text-[#4E8F01]" />
          <div>
            <h3 className="text-sm font-bold text-navy-950">48-hour change window</h3>
            <p className="mt-1 text-xs text-slate-600">
              You can switch between product and cash once, within 48 hours of your selection.
              After that the choice is final.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <h3 className="text-sm font-bold text-navy-950">Selection deadline</h3>
            <p className="mt-1 text-xs text-slate-600">
              Choose by{' '}
              <span className="font-semibold text-navy-950">
                {formatDrawDate(claim.selectionDeadlineAt)}
              </span>
              . If you don&apos;t choose, we default to product fulfilment.
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
}

interface PathCardProps {
  title: string;
  subtitle: string;
  icon: typeof Package;
  tone: 'green' | 'amber';
  headline: string;
  headlineNote: string;
  payoutLabel: string;
  payoutValue: string;
  payoutSubvalue: string;
  highlights: { icon: typeof Check; text: string }[];
  ctaLabel: string;
  isSubmitting: boolean;
  onChoose: () => void;
  disabled: boolean;
}

function PathCard(props: PathCardProps) {
  const Icon = props.icon;
  const isGreen = props.tone === 'green';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 bg-white p-6 transition-all hover:shadow-[0_24px_60px_rgba(15,23,42,0.1)] sm:p-7 ${
        isGreen
          ? 'border-emerald-200 hover:border-[#4E8F01]/50'
          : 'border-amber-200 hover:border-amber-500/50'
      }`}
    >
      {/* Background tint */}
      <div
        className={`pointer-events-none absolute right-[-30px] top-[-30px] h-40 w-40 rounded-full blur-3xl ${
          isGreen ? 'bg-[#A8E368]/20' : 'bg-amber-300/30'
        }`}
      />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  isGreen ? 'bg-[#A8E368]/30 text-[#4E8F01]' : 'bg-amber-100 text-amber-700'
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <p
                  className={`text-[10px] font-bold uppercase tracking-[0.18em] ${
                    isGreen ? 'text-[#4E8F01]' : 'text-amber-700'
                  }`}
                >
                  {props.title}
                </p>
                <p className="text-xs text-slate-500">{props.subtitle}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Headline */}
        <div className="mt-6 border-b border-slate-100 pb-6">
          <p className="font-display text-3xl font-black leading-tight text-navy-950">
            {props.headline}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">{props.headlineNote}</p>
        </div>

        {/* Payout breakdown */}
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {props.payoutLabel}
          </p>
          <p className="mt-1 font-display text-xl font-black text-navy-950 tabular-nums">
            {props.payoutValue}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">{props.payoutSubvalue}</p>
        </div>

        {/* Highlights */}
        <ul className="mt-5 space-y-3">
          {props.highlights.map((h, i) => {
            const HIcon = h.icon;
            return (
              <li key={i} className="flex items-start gap-2.5">
                <HIcon
                  className={`h-4 w-4 shrink-0 ${
                    isGreen ? 'mt-0.5 text-[#4E8F01]' : 'mt-0.5 text-amber-700'
                  }`}
                />
                <span className="text-sm leading-snug text-slate-700">{h.text}</span>
              </li>
            );
          })}
        </ul>

        {/* CTA */}
        <Button
          onClick={props.onChoose}
          isLoading={props.isSubmitting}
          disabled={props.disabled}
          variant={isGreen ? 'accent' : 'primary'}
          size="lg"
          fullWidth
          className={
            isGreen
              ? 'mt-6 rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 shadow-[0_16px_34px_rgba(78,143,1,0.22)] hover:!border-transparent hover:bg-[#B7EF79]'
              : 'mt-6 rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 shadow-[0_16px_34px_rgba(245,158,11,0.22)] hover:!border-transparent hover:bg-amber-400'
          }
        >
          {props.ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}