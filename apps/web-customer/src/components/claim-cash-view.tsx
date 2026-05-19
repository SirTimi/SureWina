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
import { Button, Card, Container } from '@surewina/ui';
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
      api.claims.getClaimPath(claimId).then((res) => res.claim),
      api.claims.getClaimKycStatus(claimId).then((res) => res.kyc),
    ])
      .then(([claimData, kycData]) => {
        setClaim(claimData);
        setKyc(kycData);
      })
      .catch((err) => setError(err.message ?? 'Could not load cash claim.'));
  }, [claimId]);

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

  if (!claim || !kyc) {
    return (
      <main className="min-h-screen bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1240px] pb-12 pt-28">
          <div className="h-[520px] animate-pulse rounded-3xl bg-white" />
        </Container>
      </main>
    );
  }

  const steps = computeSteps(claimId, kyc);
  const allComplete = steps.every((step) => step.state === 'done');
  const nextStep = steps.find((step) => step.state === 'current');

  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (new Date(kyc.kycDeadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );

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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <Card
              variant="default"
              className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm"
            >
              <div className="relative overflow-hidden bg-navy-800 p-7 text-white sm:p-8">
                <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-emerald-50 blur-3xl" />
                <div className="absolute -bottom-24 left-1/3 h-60 w-60 rounded-full bg-white/10 blur-3xl" />

                <div className="relative">
                  <div className="mb-7 inline-flex items-center gap-2 rounded-sm bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-navy-950">
                    <Banknote className="h-4 w-4" />
                    Cash conversion
                  </div>

                  <h1 className="max-w-3xl font-display text-4xl font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl">
                    Verify your identity.
                  </h1>

                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base">
                    Complete the required checks so we can pay your cash prize to a
                    verified Nigerian bank account.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 divide-y divide-slate-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                <SummaryCell
                  label="Net payout"
                  value={formatNaira(claim.netCashIfChosenNgn)}
                  subtle="Estimated amount to bank"
                />

                <SummaryCell
                  label="Gross value"
                  value={formatNaira(claim.grossPrizeValueNgn)}
                  subtle="Before deductions"
                />

                <SummaryCell
                  label="KYC deadline"
                  value={`${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`}
                  subtle="Remaining to complete"
                />
              </div>
            </Card>

            <div className="mt-6">
              <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-navy-700">
                    Verification steps
                  </p>

                  <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                    Finish these four steps.
                  </h2>
                </div>

                {nextStep && (
                  <p className="text-sm text-slate-500">
                    Continue with{' '}
                    <span className="font-bold text-navy-950">{nextStep.title}</span>
                  </p>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {steps.map((step, index) => {
                  const isLast = index === steps.length - 1;

                  return (
                    <StepRow
                      key={step.key}
                      step={step}
                      index={index}
                      total={steps.length}
                      isLast={isLast}
                    />
                  );
                })}
              </div>

              {nextStep?.href && (
                <Link href={nextStep.href} className="mt-5 inline-block">
                  <Button
                    variant="accent"
                    size="lg"
                    className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
                  >
                    Continue: {nextStep.title}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}

              {allComplete && (
                <Link href={`/claim/${claimId}/status`} className="mt-5 inline-block">
                  <Button
                    variant="accent"
                    size="lg"
                    className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
                  >
                    View claim status
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Payout summary
              </p>

              <p className="mt-3 font-display text-4xl font-black tracking-[-0.04em] text-navy-950">
                {formatNaira(claim.netCashIfChosenNgn)}
              </p>

              <p className="mt-1 text-sm text-slate-500">Estimated net amount</p>

              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <MoneyRow
                  label="Gross prize value"
                  value={formatNaira(claim.grossPrizeValueNgn)}
                />
                <MoneyRow
                  label="Estimated WHT"
                  value={`− ${formatNaira(claim.estimatedWhtNgn)}`}
                  muted
                />
                <MoneyRow
                  label="Net to bank"
                  value={formatNaira(claim.netCashIfChosenNgn)}
                  strong
                />
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
                Why verification is required.
              </p>

              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Cash prizes require identity and bank checks before payout. This protects
                the winner, prevents wrong-account payments, and keeps the claim auditable.
              </p>
            </Card>

            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-sm bg-amber-100 text-amber-700">
                <Clock className="h-5 w-5" />
              </div>

              <p className="font-display text-xl font-black text-navy-950">
                {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining.
              </p>

              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Complete all steps by{' '}
                <span className="font-bold text-navy-950">
                  {new Date(kyc.kycDeadlineAt).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                . If you miss the deadline, the prize may default to product fulfilment.
              </p>
            </Card>
          </aside>
        </div>
      </Container>
    </main>
  );
}

function StepRow({
  step,
  index,
  total,
  isLast,
}: {
  step: Step;
  index: number;
  total: number;
  isLast: boolean;
}) {
  const Icon = step.icon;
  const isClickable = step.state === 'current' && step.href;

  const row = (
    <div
      className={
        isLast
          ? 'bg-white px-4 py-4 transition'
          : 'border-b border-slate-100 bg-white px-4 py-4 transition'
      }
    >
      <div className="flex items-center gap-4">
        <div
          className={
            step.state === 'done'
              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-navy-800 text-white'
              : step.state === 'current'
                ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700'
                : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-slate-400'
          }
        >
          {step.state === 'done' ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p
              className={
                step.state === 'future'
                  ? 'text-[10px] font-black uppercase tracking-[0.16em] text-slate-400'
                  : 'text-[10px] font-black uppercase tracking-[0.16em] text-navy-700'
              }
            >
              Step {index + 1} of {total}
            </p>

            {step.state === 'current' && (
              <span className="rounded-sm bg-navy-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-navy-700">
                Continue here
              </span>
            )}

            {step.state === 'done' && (
              <span className="rounded-sm bg-navy-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-navy-700">
                Done
              </span>
            )}
          </div>

          <p
            className={
              step.state === 'future'
                ? 'font-bold text-slate-400'
                : 'font-bold text-navy-950'
            }
          >
            {step.title}
          </p>

          <p
            className={
              step.state === 'future'
                ? 'mt-0.5 text-sm text-slate-400'
                : 'mt-0.5 text-sm text-slate-500'
            }
          >
            {step.description}
          </p>
        </div>

        {isClickable && <ArrowRight className="h-5 w-5 shrink-0 text-navy-700" />}
      </div>
    </div>
  );

  if (isClickable && step.href) {
    return (
      <Link href={step.href} className="block hover:bg-[#F8FAF4]">
        {row}
      </Link>
    );
  }

  return row;
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

      <p className="mt-1 font-display text-xl font-black text-navy-950">{value}</p>

      <p className="mt-1 text-xs text-slate-500">{subtle}</p>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  muted = false,
  strong = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span
        className={
          strong
            ? 'text-sm font-bold text-navy-950'
            : muted
              ? 'text-sm text-slate-500'
              : 'text-sm text-slate-600'
        }
      >
        {label}
      </span>

      <span
        className={
          strong
            ? 'font-display text-lg font-black text-navy-950 tabular-nums'
            : muted
              ? 'text-sm font-semibold text-slate-500 tabular-nums'
              : 'text-sm font-bold text-navy-950 tabular-nums'
        }
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
      description: 'Used to confirm your identity before payout',
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
      description: 'Net amount is paid after the final step is cleared',
      icon: Banknote,
      state: allDone ? 'done' : bankDone ? 'current' : 'future',
    },
  ];
}