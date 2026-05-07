'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Hash,
  ShieldCheck,
  Ticket,
  Trophy,
} from 'lucide-react';
import { Badge, Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { GetTicketDetailResponse } from '@surewina/types';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';

interface TicketDetailViewProps {
  ticketRef: string;
}

export function TicketDetailView({ ticketRef }: TicketDetailViewProps) {
  const [data, setData] = useState<GetTicketDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard
      .getTicketDetail(ticketRef)
      .then(setData)
      .catch((err) => setError(err.message ?? 'Could not load ticket.'));
  }, [ticketRef]);

  if (error) {
    return (
      <Card
        variant="default"
        className="rounded-2xl border-red-100 bg-white p-8 text-center shadow-sm"
      >
        <AlertCircle className="mx-auto h-7 w-7 text-red-600" />
        <p className="mt-3 text-sm font-bold text-red-600">{error}</p>

        <Link href="/dashboard/tickets" className="mt-6 inline-block">
          <Button variant="secondary" className="rounded-sm">
            <ArrowLeft className="h-4 w-4" />
            Back to tickets
          </Button>
        </Link>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="h-48 animate-pulse rounded-2xl bg-white" />
        <div className="h-32 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  const { ticket, draw, siblingTickets, claimId } = data;
  const isJackpot = ticket.drawType === 'SATURDAY_JACKPOT';

  return (
    <div>
      <Link
        href="/dashboard/tickets"
        className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-[#4E8F01] transition hover:text-[#3f7601]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tickets
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card
          variant="default"
          className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-100 bg-[#F8FAF4] p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
                {drawTypeShortLabel[ticket.drawType]}
              </Badge>

              {ticket.isWinner ? (
                <Badge variant="verified" withDot>
                  Winning ticket
                </Badge>
              ) : ticket.awaitingDraw ? (
                <Badge variant="live" withDot>
                  Awaiting draw
                </Badge>
              ) : (
                <Badge variant="closed">Did not win</Badge>
              )}
            </div>

            <h1 className="font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
              {ticket.drawPrizeDescription}
            </h1>

            <p className="mt-2 font-mono text-sm font-bold text-[#4E8F01]">
              {ticket.ticketRef}
            </p>
          </div>

          <div className="grid grid-cols-1 border-b border-slate-100 sm:grid-cols-2">
            <DetailCell
              icon={<Ticket className="h-4 w-4" />}
              label="Ticket reference"
              value={ticket.ticketRef}
              mono
            />

            <DetailCell
              icon={<Hash className="h-4 w-4" />}
              label="Draw code"
              value={ticket.drawCode}
              mono
            />

            <DetailCell
              icon={<CalendarDays className="h-4 w-4" />}
              label="Draw date"
              value={formatDrawDate(ticket.drawScheduledAt)}
            />

            <DetailCell
              icon={<Clock className="h-4 w-4" />}
              label="Draw time"
              value={formatDrawTime(ticket.drawScheduledAt)}
            />
          </div>

          <div className="p-6">
            <h2 className="font-display text-xl font-black text-navy-950">
              Ticket status
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {ticket.isWinner
                ? 'This ticket is marked as a winner. Start or continue your claim from the claims page.'
                : ticket.awaitingDraw
                  ? 'This ticket is still in play. Results will appear after the draw has completed.'
                  : 'This ticket did not win. It remains in your history for verification.'}
            </p>

            {siblingTickets.length > 0 && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-[#F8FAF4] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4E8F01]">
                  Other tickets in this draw
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {siblingTickets.slice(0, 8).map((ref) => (
                    <span
                      key={ref}
                      className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600"
                    >
                      {ref}
                    </span>
                  ))}

                  {siblingTickets.length > 8 && (
                    <span className="px-1 py-0.5 text-[11px] font-semibold text-slate-400">
                      +{siblingTickets.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {ticket.isWinner && claimId && (
              <Link href={`/dashboard/claims/${claimId}`} className="mt-5 inline-block">
                <Button
                  variant="accent"
                  className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 hover:!border-transparent hover:bg-[#B7EF79]"
                >
                  <Trophy className="h-4 w-4" />
                  View claim
                </Button>
              </Link>
            )}
          </div>
        </Card>

        <aside className="space-y-4">
          <Card
            variant="default"
            className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
              Face value
            </p>

            <p className="mt-2 font-display text-3xl font-black text-navy-950">
              {formatNaira(ticket.faceValueNgn)}
            </p>
          </Card>

          <Card
            variant="default"
            className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
              Prize value
            </p>

            <p className="mt-2 font-display text-3xl font-black text-navy-950">
              {formatNaira(draw.prizeValueNgn)}
            </p>
          </Card>

          <Card
            variant="default"
            className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <p className="font-display text-xl font-black text-navy-950">
              Keep your reference safe.
            </p>

            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Your ticket reference is the public proof of entry used for result checks
              and claim verification.
            </p>
          </Card>

          {ticket.isWinner && (
            <Card
              variant="default"
              className="rounded-2xl border-[#4E8F01]/15 bg-[#F8FAF4] p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#4E8F01]" />

                <div>
                  <p className="text-sm font-black text-navy-950">Winning ticket</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    This ticket matched the published winning reference for the draw.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function DetailCell({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="border-b border-slate-100 p-5 last:border-b-0 sm:border-r sm:even:border-r-0">
      <div className="mb-2 flex items-center gap-2 text-[#4E8F01]">
        {icon}
        <p className="text-[10px] font-black uppercase tracking-[0.14em]">{label}</p>
      </div>

      <p
        className={
          mono
            ? 'break-all font-mono text-sm font-bold text-navy-950'
            : 'text-sm font-bold text-navy-950'
        }
      >
        {value}
      </p>
    </div>
  );
}