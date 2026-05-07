'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Check,
  ChevronLeft,
  Clock,
  CreditCard,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { Button, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { ClaimKycStatus, ClaimPath } from '@surewina/types';
import { api } from '@/lib/api';

interface ClaimCashViewProps {
  claimId: string;
}

type StepKey = 'kyc_docs' | 'bvn' | 'bank' | 'payout';

interface Step {
  key: StepKey;
  title: string;
  description: string;
  icon: typeof FileText;
  state: 'done' | 'current' | 'future';
  href?: string;
}

export function ClaimCashView({ claimId }: ClaimCashViewProps) {
  const [claim, setClaim] = useState<ClaimPath | null>(null);
  const [kyc, setKyc] = useState<ClaimKycStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.claims.getClaimPath(claimId).then((r) => r.claim),
      api.claims.getClaimKycStatus(claimId).then((r) => r.kyc),
    ])
      .then(([c, k]) => {
        setClaim(c);
        setKyc(k);
      })
      .catch((err) => setError(err.message ?? 'Could not load.'));
  }, [claimId]);

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

  if (!claim || !kyc) {
    return (
      <Container size="md" className="py-16">
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
      </Container>
    );
  }

  const steps = computeSteps(claimId, kyc);
  const allComplete = steps.every((s) => s.state === 'done');
  const nextStep = steps.find((s) => s.state === 'current');

  // Days remaining until KYC deadline
  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(kyc.kycDeadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );

  return (
    <Container size="lg" className="max-w-[1180px] py-10">
      <Link
        href={`/claim/${claimId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-[#4E8F01]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to claim chooser
      </Link>

      {/* Heading */}
      <div className="mb-8 max-w-2xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
          <Banknote className="h-3.5 w-3.5" />
          Step 2 · Cash conversion
        </div>
        <h1 className="font-display text-4xl font-black leading-tight tracking-[-0.02em] text-navy-950 sm:text-5xl">
          {allComplete ? 'KYC complete.' : 'Verify your identity.'}
        </h1>
        <p className="mt-3 text-base text-slate-600">
          {allComplete
            ? 'Bank transfer queued. Net amount will hit your account within 24 hours.'
            : 'Tier 1 KYC is required before we can pay cash. Four short steps — usually under 5 minutes.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT: Step list */}
        <div className="space-y-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isClickable = step.state === 'current' && step.href;

            const card = (
              <div
                className={`flex items-start gap-4 rounded-2xl border-2 bg-white p-5 transition ${
                  step.state === 'done'
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : step.state === 'current'
                    ? 'border-[#4E8F01] shadow-[0_18px_50px_rgba(78,143,1,0.15)]'
                    : 'border-slate-200 opacity-70'
                } ${isClickable ? 'hover:shadow-[0_24px_60px_rgba(15,23,42,0.1)]' : ''}`}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 ${
                    step.state === 'done'
                      ? 'border-[#4E8F01] bg-[#4E8F01] text-white'
                      : step.state === 'current'
                      ? 'border-[#4E8F01] bg-[#A8E368]/20 text-[#4E8F01]'
                      : 'border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                >
                  {step.state === 'done' ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p
                      className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                        step.state === 'done'
                          ? 'text-emerald-700'
                          : step.state === 'current'
                          ? 'text-[#4E8F01]'
                          : 'text-slate-400'
                      }`}
                    >
                      Step {i + 1} of {steps.length}
                    </p>
                    {step.state === 'current' && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                        ← Continue here
                      </span>
                    )}
                  </div>
                  <h3
                    className={`mt-1 font-bold ${
                      step.state === 'future' ? 'text-slate-400' : 'text-navy-950'
                    }`}
                  >
                    {step.title}
                  </h3>
                  <p
                    className={`mt-1 text-sm ${
                      step.state === 'future' ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    {step.description}
                  </p>
                </div>

                {isClickable && (
                  <ArrowRight className="mt-3 h-5 w-5 shrink-0 text-[#4E8F01]" />
                )}
              </div>
            );

            return isClickable && step.href ? (
              <Link key={step.key} href={step.href}>
                {card}
              </Link>
            ) : (
              <div key={step.key}>{card}</div>
            );
          })}

          {nextStep && nextStep.href && (
            <Link href={nextStep.href} className="block pt-2">
              <Button
                variant="accent"
                size="lg"
                fullWidth
                className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 shadow-[0_16px_34px_rgba(78,143,1,0.22)] hover:!border-transparent hover:bg-[#B7EF79]"
              >
                Continue: {nextStep.title}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}

          {allComplete && (
            <Link href={`/claim/${claimId}/status`} className="block pt-2">
              <Button
                variant="accent"
                size="lg"
                fullWidth
                className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 shadow-[0_16px_34px_rgba(78,143,1,0.22)] hover:!border-transparent hover:bg-[#B7EF79]"
              >
                View claim status
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>

        {/* RIGHT: Payout summary + WHT explanation */}
        <aside className="lg:sticky lg:top-6 lg:self-start space-y-4">
          {/* Net amount card */}
          <div className="overflow-hidden rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
              You will receive
            </p>
            <p className="mt-2 font-display text-3xl font-black tabular-nums text-navy-950">
              {formatNaira(claim.netCashIfChosenNgn)}
            </p>
            <div className="mt-4 space-y-2 border-t border-amber-200/50 pt-3 text-sm">
              <Row
                label="Gross prize value"
                value={formatNaira(claim.grossPrizeValueNgn)}
                tone="default"
              />
              <Row
                label="WHT (10%)"
                value={`− ${formatNaira(claim.estimatedWhtNgn)}`}
                tone="muted"
              />
              <div className="my-2 border-t border-amber-200/50" />
              <Row
                label="Net to your bank"
                value={formatNaira(claim.netCashIfChosenNgn)}
                tone="emphasis"
              />
            </div>
          </div>

          {/* WHT explainer */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                Why we deduct WHT
              </p>
            </div>
            <div className="space-y-3 p-5 text-sm text-slate-600">
              <p>
                Nigerian law requires us to withhold 10% on lottery cash prizes over ₦10,000 and
                remit it directly to the Federal Inland Revenue Service.
              </p>
              <p>
                You receive a tax certificate by SMS and email after the transfer — keep it for
                your records.
              </p>
            </div>
          </div>

          {/* Deadline warning */}
          <div className="overflow-hidden rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 shrink-0 text-rose-600" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-700">
                  KYC deadline
                </p>
                <p className="mt-1 text-sm font-bold text-navy-950">
                  {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Complete all 4 steps by{' '}
                  {new Date(kyc.kycDeadlineAt).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  . Otherwise the prize defaults to product fulfilment.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </Container>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'default' | 'muted' | 'emphasis';
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className={
          tone === 'emphasis'
            ? 'text-sm font-bold text-navy-950'
            : tone === 'muted'
            ? 'text-sm text-slate-500'
            : 'text-sm text-slate-700'
        }
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${
          tone === 'emphasis'
            ? 'text-base font-black text-navy-950'
            : tone === 'muted'
            ? 'text-sm text-slate-500'
            : 'text-sm font-semibold text-navy-950'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function computeSteps(claimId: string, kyc: ClaimKycStatus): Step[] {
  const docsUploaded = kyc.documentUploaded && kyc.selfieUploaded;
  const bvnDone = kyc.bvnLast4 !== null;
  const bankDone = kyc.bankAccount !== null;
  const allDone = kyc.status === 'COMPLETE';

  return [
    {
      key: 'kyc_docs',
      title: 'Upload ID and selfie',
      description: 'NIN, voter card, driver licence, or passport — plus a quick selfie',
      icon: FileText,
      state: docsUploaded ? 'done' : 'current',
      href: `/claim/${claimId}/cash/kyc`,
    },
    {
      key: 'bvn',
      title: 'Verify your BVN',
      description: '11-digit Bank Verification Number — used to confirm your identity',
      icon: ShieldCheck,
      state: bvnDone ? 'done' : docsUploaded ? 'current' : 'future',
      href: `/claim/${claimId}/cash/kyc?step=bvn`,
    },
    {
      key: 'bank',
      title: 'Link your bank account',
      description: 'We pay directly to your verified Nigerian bank account',
      icon: CreditCard,
      state: bankDone ? 'done' : bvnDone ? 'current' : 'future',
      href: `/claim/${claimId}/cash/kyc?step=bank`,
    },
    {
      key: 'payout',
      title: 'Bank transfer',
      description: 'Net amount paid within 24 hours of the final step',
      icon: Banknote,
      state: allDone ? 'done' : bankDone ? 'current' : 'future',
    },
  ];
}