'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Banknote,
  Check,
  ChevronLeft,
  Clock,
  Home,
  Package,
  ShieldCheck,
  Trophy,
  Truck,
} from 'lucide-react';
import { Button, Container } from '@surewina/ui';
import type { ClaimStatusEvent, GetClaimStatusResponse } from '@surewina/types';
import { api } from '@/lib/api';

interface ClaimStatusViewProps {
  claimId: string;
}

const iconMap = {
  trophy: Trophy,
  check: Check,
  shield: ShieldCheck,
  package: Package,
  banknote: Banknote,
  truck: Truck,
  home: Home,
  clock: Clock,
  alert: AlertTriangle,
};

export function ClaimStatusView({ claimId }: ClaimStatusViewProps) {
  const [data, setData] = useState<GetClaimStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.claims
      .getClaimStatus(claimId)
      .then(setData)
      .catch((err) => setError(err.message ?? 'Could not load claim status.'));
  }, [claimId]);

  if (error && !data) {
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

  if (!data) {
    return (
      <Container size="md" className="py-16">
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
      </Container>
    );
  }

  return (
    <Container size="md" className="max-w-[820px] py-10">
      <Link
        href="/dashboard/claims"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-[#4E8F01]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to my claims
      </Link>

      {/* Heading */}
      <div className="mb-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#4E8F01]">
          Claim status
        </p>
        <h1 className="mt-2 font-display text-4xl font-black leading-tight tracking-[-0.02em] text-navy-950 sm:text-5xl">
          {data.prizeDescription}
        </h1>
        <p className="mt-3 text-base text-slate-600">
          Current status:{' '}
          <span className="font-semibold text-navy-950">{data.currentStatus}</span>
        </p>
      </div>

      {/* Selected path summary */}
      {data.selectedPath && (
        <div
          className={`mb-8 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold ${
            data.selectedPath === 'CASH'
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {data.selectedPath === 'CASH' ? (
            <>
              <Banknote className="h-4 w-4" />
              Cash conversion
            </>
          ) : (
            <>
              <Package className="h-4 w-4" />
              Product fulfilment
            </>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Timeline
          </p>
        </div>

        <div className="relative px-6 py-6">
          {/* Vertical rule */}
          <div className="absolute left-[39px] top-10 bottom-10 w-px bg-slate-200" />

          <ol className="space-y-6">
            {data.events.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </ol>
        </div>

        {data.estimatedCompletionAt && (
          <div className="border-t border-slate-100 bg-slate-50/40 px-6 py-4">
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-navy-950">Estimated completion:</span>{' '}
              {new Date(data.estimatedCompletionAt).toLocaleString('en-NG', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              WAT
            </p>
          </div>
        )}
      </div>

      {/* Help footer */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/60 p-6">
        <h3 className="font-bold text-navy-950">Something doesn&apos;t look right?</h3>
        <p className="mt-2 text-sm text-slate-600">
          Contact our claims team — we&apos;ll trace your prize end-to-end on the audit log and
          get back to you within 24 hours.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link href="/disputes">
            <Button variant="primary" size="md">
              Open a dispute
            </Button>
          </Link>
          <a href="mailto:claims@surewina.ng">
            <Button variant="secondary" size="md">
              Email claims@surewina.ng
            </Button>
          </a>
        </div>
      </div>
    </Container>
  );
}

function TimelineItem({ event }: { event: ClaimStatusEvent }) {
  const Icon = iconMap[event.iconKey];

  const stateStyles = {
    done: 'border-[#4E8F01] bg-[#4E8F01] text-white',
    current: 'border-amber-500 bg-amber-100 text-amber-700 ring-4 ring-amber-100',
    future: 'border-slate-200 bg-white text-slate-400',
  };

  return (
    <li className="relative flex gap-5">
      <div
        className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 transition ${stateStyles[event.state]}`}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 pt-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3
            className={`font-bold ${
              event.state === 'future' ? 'text-slate-400' : 'text-navy-950'
            }`}
          >
            {event.label}
          </h3>
          <span className="shrink-0 text-xs text-slate-500 tabular-nums">
            {new Date(event.timestamp).toLocaleString('en-NG', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        {event.description && (
          <p
            className={`mt-1 text-sm ${
              event.state === 'future' ? 'text-slate-400' : 'text-slate-600'
            }`}
          >
            {event.description}
          </p>
        )}
      </div>
    </li>
  );
}