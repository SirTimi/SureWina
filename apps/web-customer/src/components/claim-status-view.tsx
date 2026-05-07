'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  ChevronLeft,
  Clock,
  Home,
  LifeBuoy,
  Package,
  ShieldCheck,
  Trophy,
  Truck,
} from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ClaimStatusView({ claimId }: ClaimStatusViewProps) {
  const [data, setData] = useState<GetClaimStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.claims
      .getClaimStatus(claimId)
      .then(setData)
      .catch((err) => setError(err.message ?? 'Could not load claim status.'));
  }, [claimId]);

  const currentEvent = useMemo(() => {
    return data?.events.find((event) => event.state === 'current') ?? null;
  }, [data]);

  const completedCount = useMemo(() => {
    return data?.events.filter((event) => event.state === 'done').length ?? 0;
  }, [data]);

  if (error && !data) {
    return (
      <main className="min-h-screen bg-[#F8FAF4]">
        <Container size="sm" className="py-20 text-center">
          <Card
            variant="default"
            className="rounded-2xl border-red-100 bg-white p-8 shadow-sm"
          >
            <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />

            <h1 className="mt-4 font-display text-2xl font-black text-navy-950">
              Claim not found
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-slate-500">{error}</p>

            <Link href="/dashboard/claims" className="mt-6 inline-block">
              <Button
                variant="accent"
                className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 hover:!border-transparent hover:bg-[#B7EF79]"
              >
                Back to my claims
              </Button>
            </Link>
          </Card>
        </Container>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1240px] pb-12 pt-28">
          <div className="h-[520px] animate-pulse rounded-3xl bg-white" />
        </Container>
      </main>
    );
  }

  const totalEvents = data.events.length;
  const progressPercent =
    totalEvents > 0 ? Math.round((completedCount / totalEvents) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#F8FAF4]">
      <Container size="lg" className="max-w-[1240px] pb-12 pt-28">
        <Link
          href="/dashboard/claims"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#4E8F01] transition hover:text-[#3f7601]"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to my claims
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0">
            <Card
              variant="default"
              className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm"
            >
              <div className="relative overflow-hidden bg-[#4E8F01] p-7 text-white sm:p-8">
                <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[#A8E368]/25 blur-3xl" />
                <div className="absolute -bottom-24 left-1/3 h-60 w-60 rounded-full bg-white/10 blur-3xl" />

                <div className="relative">
                  <div className="mb-7 inline-flex items-center gap-2 rounded-sm bg-[#A8E368] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-navy-950">
                    <Trophy className="h-4 w-4" />
                    Claim status
                  </div>

                  <h1 className="max-w-3xl font-display text-4xl font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl">
                    {data.prizeDescription}
                  </h1>

                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base">
                    Current status:{' '}
                    <span className="font-bold text-white">{data.currentStatus}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 divide-y divide-slate-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                <SummaryCell
                  label="Selected path"
                  value={data.selectedPath ? formatSelectedPath(data.selectedPath) : 'Not selected'}
                  subtle="Prize fulfilment route"
                />

                <SummaryCell
                  label="Progress"
                  value={`${progressPercent}%`}
                  subtle={`${completedCount} of ${totalEvents} steps completed`}
                />

                <SummaryCell
                  label="Current step"
                  value={currentEvent?.label ?? data.currentStatus}
                  subtle="What is happening now"
                />
              </div>
            </Card>

            <Card
              variant="default"
              className="mt-6 overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
                  Timeline
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Follow the claim from winning ticket to completion.
                </p>
              </div>

              <div className="relative p-5 sm:p-6">
                <div className="absolute bottom-8 left-[41px] top-8 hidden w-px bg-slate-200 sm:block" />

                <ol className="space-y-5">
                  {data.events.map((event) => (
                    <TimelineItem key={event.id} event={event} />
                  ))}
                </ol>
              </div>

              {data.estimatedCompletionAt && (
                <div className="border-t border-slate-100 bg-[#F8FAF4] px-5 py-4">
                  <p className="text-sm text-slate-600">
                    <span className="font-bold text-navy-950">
                      Estimated completion:
                    </span>{' '}
                    {formatDateTime(data.estimatedCompletionAt)} WAT
                  </p>
                </div>
              )}
            </Card>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
                Claim summary
              </p>

              <h2 className="mt-3 font-display text-2xl font-black leading-tight tracking-[-0.03em] text-navy-950">
                {data.prizeDescription}
              </h2>

              {data.selectedPath && (
                <div
                  className={
                    data.selectedPath === 'CASH'
                      ? 'mt-5 inline-flex items-center gap-2 rounded-sm bg-slate-100 px-3 py-2 text-sm font-bold text-navy-950'
                      : 'mt-5 inline-flex items-center gap-2 rounded-sm bg-[#A8E368]/25 px-3 py-2 text-sm font-bold text-[#4E8F01]'
                  }
                >
                  {data.selectedPath === 'CASH' ? (
                    <Banknote className="h-4 w-4" />
                  ) : (
                    <Package className="h-4 w-4" />
                  )}
                  {formatSelectedPath(data.selectedPath)}
                </div>
              )}

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#4E8F01]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <p className="mt-2 text-xs text-slate-500">
                {completedCount} of {totalEvents} timeline events completed.
              </p>
            </Card>

            {currentEvent && (
              <Card
                variant="default"
                className="rounded-3xl border-[#4E8F01]/15 bg-[#F8FAF4] p-6 shadow-sm"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
                  <Clock className="h-5 w-5" />
                </div>

                <p className="font-display text-xl font-black text-navy-950">
                  Current step
                </p>

                <p className="mt-2 text-sm font-bold text-navy-950">
                  {currentEvent.label}
                </p>

                {currentEvent.description && (
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {currentEvent.description}
                  </p>
                )}
              </Card>
            )}

            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
                <LifeBuoy className="h-5 w-5" />
              </div>

              <p className="font-display text-xl font-black text-navy-950">
                Something looks wrong?
              </p>

              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Contact the claims team and include your claim ID. They can trace the
                claim end-to-end.
              </p>

              <div className="mt-5 flex flex-col gap-2">
                <Link href="/disputes">
                  <Button
                    variant="accent"
                    size="md"
                    fullWidth
                    className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 hover:!border-transparent hover:bg-[#B7EF79]"
                  >
                    Open dispute
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>

                <a
                  href="mailto:claims@surewina.ng"
                  className="inline-flex items-center justify-center rounded-sm border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Email claims@surewina.ng
                </a>
              </div>
            </Card>
          </aside>
        </div>
      </Container>
    </main>
  );
}

function TimelineItem({ event }: { event: ClaimStatusEvent }) {
  const Icon = iconMap[event.iconKey];

  return (
    <li className="relative flex gap-4">
      <div
        className={
          event.state === 'done'
            ? 'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#4E8F01] text-white'
            : event.state === 'current'
              ? 'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01] ring-4 ring-[#A8E368]/20'
              : 'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-slate-400'
        }
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1 pb-1">
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_130px] sm:items-start">
          <div>
            <p
              className={
                event.state === 'future'
                  ? 'font-bold text-slate-400'
                  : 'font-bold text-navy-950'
              }
            >
              {event.label}
            </p>

            {event.description && (
              <p
                className={
                  event.state === 'future'
                    ? 'mt-0.5 text-sm leading-relaxed text-slate-400'
                    : 'mt-0.5 text-sm leading-relaxed text-slate-600'
                }
              >
                {event.description}
              </p>
            )}
          </div>

          <span className="text-xs text-slate-500 tabular-nums sm:text-right">
            {formatDateTime(event.timestamp)}
          </span>
        </div>
      </div>
    </li>
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
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
        {label}
      </p>

      <p className="mt-1 line-clamp-1 font-display text-xl font-black text-navy-950">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">{subtle}</p>
    </div>
  );
}

function formatSelectedPath(path: string) {
  if (path === 'CASH') return 'Cash conversion';
  if (path === 'PRODUCT') return 'Product fulfilment';
  return path;
}