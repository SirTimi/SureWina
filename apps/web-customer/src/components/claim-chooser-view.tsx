'use client';

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
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
  Ticket,
  Truck,
} from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';
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
        <Container size="lg" className="max-w-[1240px] py-12">
          <div className="h-[520px] animate-pulse rounded-3xl bg-white" />
        </Container>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAF4]">
      <Container size="lg" className="max-w-[1240px] py-12">
        <Link
          href={`/winners/${claimId}`}
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to win notification
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
                  <div className="mb-8 inline-flex items-center gap-2 rounded-sm bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-navy-950">
                    <Ticket className="h-4 w-4" />
                    Prize claim
                  </div>

                  <h1 className="max-w-3xl font-display text-4xl font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl">
                    Choose how to receive your prize.
                  </h1>

                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base">
                    You won{' '}
                    <span className="font-bold text-white">{claim.prizeDescription}</span>.
                    Choose product fulfilment or cash conversion. Your selection controls
                    the next steps.
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
                  label="Gross value"
                  value={formatNaira(claim.grossPrizeValueNgn)}
                  subtle="Before any cash deductions"
                />

                <SummaryCell
                  label="Selection deadline"
                  value={formatDrawDate(claim.selectionDeadlineAt)}
                  subtle="Choose before this date"
                />
              </div>
            </Card>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <PathCard
                title="Product fulfilment"
                subtitle="Receive the actual prize"
                icon={Package}
                tone="green"
                headline={claim.prizeDescription}
                headlineNote="Best option if you want the item exactly as advertised."
                payoutLabel="You receive"
                payoutValue={claim.prizeDescription}
                payoutSubvalue={`Product value ${formatNaira(claim.grossPrizeValueNgn)}`}
                highlights={[
                  { icon: Check, text: 'No bank KYC required for product collection.' },
                  { icon: Truck, text: 'Delivery or collection depends on fulfilment setup.' },
                  {
                    icon: Camera,
                    text: claim.isJackpot
                      ? 'Jackpot handover may require simple verification.'
                      : 'Collection instructions are confirmed by SMS.',
                  },
                  { icon: ShieldCheck, text: 'Ticket reference is verified before release.' },
                ]}
                ctaLabel="Choose product"
                isSubmitting={submitting === 'PRODUCT'}
                onChoose={() => handleChoose('PRODUCT')}
                disabled={submitting !== null}
              />

              <PathCard
                title="Cash conversion"
                subtitle="Paid to your bank account"
                icon={Banknote}
                tone="cash"
                headline={formatNaira(claim.netCashIfChosenNgn)}
                headlineNote="Estimated net amount after withholding tax."
                payoutLabel="You receive"
                payoutValue={formatNaira(claim.netCashIfChosenNgn)}
                payoutSubvalue={`Gross ${formatNaira(
                  claim.grossPrizeValueNgn,
                )} − WHT ${formatNaira(claim.estimatedWhtNgn)}`}
                highlights={[
                  { icon: AlertCircle, text: 'Identity and bank verification are required.' },
                  { icon: Clock, text: 'Payout starts after KYC is cleared.' },
                  {
                    icon: Banknote,
                    text: 'Withholding tax may apply to eligible cash prizes.',
                  },
                  { icon: ShieldCheck, text: 'Bank account must match verified claim details.' },
                ]}
                ctaLabel="Choose cash"
                isSubmitting={submitting === 'CASH'}
                onChoose={() => handleChoose('CASH')}
                disabled={submitting !== null}
              />
            </div>

            {error && (
              <div className="mt-6 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-sm leading-relaxed text-red-700">{error}</p>
              </div>
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Claim summary
              </p>

              <div className="mt-5 space-y-4">
                <SummaryRow label="Prize value" value={formatNaira(claim.grossPrizeValueNgn)} />
                <SummaryRow label="Cash option" value={formatNaira(claim.netCashIfChosenNgn)} />
                <SummaryRow label="Estimated WHT" value={formatNaira(claim.estimatedWhtNgn)} />
              </div>

              <div className="mt-5 rounded-2xl border border-navy-100 bg-[#F8FAF4] p-4">
                <p className="text-sm font-black text-navy-950">Selection deadline</p>
                <p className="mt-1 text-sm text-slate-600">
                  Choose by{' '}
                  <span className="font-bold text-navy-950">
                    {formatDrawDate(claim.selectionDeadlineAt)}
                  </span>
                  . If you do not choose, the claim may default to product fulfilment.
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
                Keep your ticket reference close.
              </p>

              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Your claim is tied to your winning ticket. Support may ask for it when
                helping with fulfilment.
              </p>
            </Card>

            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                What happens next?
              </p>

              <ol className="mt-4 space-y-3">
                <StepItem n="1" text="Choose product or cash." />
                <StepItem n="2" text="Complete the required next step." />
                <StepItem n="3" text="Receive collection or payout confirmation." />
              </ol>
            </Card>
          </aside>
        </div>
      </Container>
    </main>
  );
}

function PathCard({
  title,
  subtitle,
  icon: Icon,
  tone,
  headline,
  headlineNote,
  payoutLabel,
  payoutValue,
  payoutSubvalue,
  highlights,
  ctaLabel,
  isSubmitting,
  onChoose,
  disabled,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: 'green' | 'cash';
  headline: string;
  headlineNote: string;
  payoutLabel: string;
  payoutValue: string;
  payoutSubvalue: string;
  highlights: { icon: LucideIcon; text: string }[];
  ctaLabel: string;
  isSubmitting: boolean;
  onChoose: () => void;
  disabled: boolean;
}) {
  const isGreen = tone === 'green';

  return (
    <Card
      variant="default"
      className={
        isGreen
          ? 'overflow-hidden rounded-3xl border-navy-200 bg-white shadow-sm transition hover:shadow-[0_18px_50px_rgba(15,23,42,0.07)]'
          : 'overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm transition hover:shadow-[0_18px_50px_rgba(15,23,42,0.07)]'
      }
    >
      <div
        className={
          isGreen
            ? 'border-b border-navy-100 bg-[#F8FAF4] p-6'
            : 'border-b border-slate-100 bg-white p-6'
        }
      >
        <div className="flex items-start gap-3">
          <div
            className={
              isGreen
                ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700'
                : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-slate-600'
            }
          >
            <Icon className="h-5 w-5" />
          </div>

          <div>
            <p
              className={
                isGreen
                  ? 'text-[10px] font-black uppercase tracking-[0.16em] text-navy-700'
                  : 'text-[10px] font-black uppercase tracking-[0.16em] text-slate-500'
              }
            >
              {title}
            </p>

            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="font-display text-2xl font-black leading-tight tracking-[-0.03em] text-navy-950">
            {headline}
          </p>

          <p className="mt-2 text-sm leading-relaxed text-slate-500">{headlineNote}</p>
        </div>
      </div>

      <div className="p-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            {payoutLabel}
          </p>

          <p className="mt-1 font-display text-lg font-black text-navy-950 tabular-nums">
            {payoutValue}
          </p>

          <p className="mt-1 text-xs leading-relaxed text-slate-500 tabular-nums">
            {payoutSubvalue}
          </p>
        </div>

        <ul className="mt-5 space-y-3">
          {highlights.map((item, index) => {
            const HIcon = item.icon;

            return (
              <li key={index} className="flex items-start gap-2.5">
                <HIcon
                  className={
                    isGreen
                      ? 'mt-0.5 h-4 w-4 shrink-0 text-navy-700'
                      : 'mt-0.5 h-4 w-4 shrink-0 text-slate-500'
                  }
                />
                <span className="text-sm leading-relaxed text-slate-600">
                  {item.text}
                </span>
              </li>
            );
          })}
        </ul>

        <Button
          onClick={onChoose}
          isLoading={isSubmitting}
          disabled={disabled}
          variant="accent"
          size="lg"
          fullWidth
          className={
            isGreen
              ? 'mt-6 rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400'
              : 'mt-6 rounded-sm !border-transparent bg-navy-950 font-bold text-white hover:!border-transparent hover:bg-navy-900'
          }
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
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
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="font-display text-lg font-black text-navy-950 tabular-nums">
        {value}
      </span>
    </div>
  );
}

function StepItem({ n, text }: { n: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-navy-50 font-mono text-xs font-black text-navy-700">
        {n}
      </span>
      <span className="pt-1 text-sm leading-relaxed text-slate-600">{text}</span>
    </li>
  );
}