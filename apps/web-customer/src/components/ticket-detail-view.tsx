'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Trophy, Clock, Hash, Copy, Check } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '@surewina/ui';
import { formatNaira, getStateByCode } from '@surewina/utils';
import type { GetTicketDetailResponse } from '@surewina/types';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';
import { SearchX } from 'lucide-react';

interface TicketDetailViewProps {
  ticketRef: string;
}

function formatCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Drawing now';
  const totalMins = Math.floor(ms / (60 * 1000));
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const minutes = totalMins % 60;
  if (days >= 1) return `${days}d ${hours}h ${minutes}m`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function TicketDetailView({ ticketRef }: TicketDetailViewProps) {
  const [data, setData] = useState<GetTicketDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.dashboard
      .getTicketDetail(ticketRef)
      .then(setData)
      .catch((err) =>
        setError(err.message ?? 'Could not load this ticket.'),
      );
  }, [ticketRef]);

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(ticketRef);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };

  if (error) {
    return (
      <>
        <Link
          href="/dashboard/tickets"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-navy-800 mb-6"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to my tickets
        </Link>
        <Card variant="default">
          <EmptyState
            icon={<SearchX className="w-12 h-12" />}
            title="Ticket not found"
            description="This ticket reference doesn't match any of your purchases. The reference may be incorrect, or this ticket belongs to a different account."
            action={
              <Link href="/dashboard/tickets">
                <Button variant="primary">View all tickets</Button>
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <div className="h-4 w-40 bg-ink-100 rounded animate-pulse mb-6" />
        <div className="h-72 bg-ink-100 rounded-lg animate-pulse" />
      </>
    );
  }

  const { ticket, draw, siblingTickets, claimId } = data;
  const isJackpot = ticket.drawType === 'SATURDAY_JACKPOT';
  const state = getStateByCode(ticket.stateOfPlayCode);

  return (
    <>
      <Link
        href="/dashboard/tickets"
        className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-navy-800 mb-6"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to my tickets
      </Link>

      {/* Winner banner */}
      {ticket.isWinner && (
        <Card variant="default" className="overflow-hidden mb-6 border-amber-100">
          <div className="bg-amber-50 p-6 flex items-start gap-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500 flex-shrink-0">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">
                Winning ticket
              </p>
              <h2 className="font-display text-xl font-bold text-ink-950 mt-0.5">
                You won {formatNaira(draw.prizeValueNgn)}
              </h2>
              <p className="text-sm text-ink-700 mt-1">
                Prize: {ticket.drawPrizeDescription}
              </p>
            </div>
            {claimId && (
              <Link href={`/dashboard/claims#${claimId}`} className="flex-shrink-0">
                <Button variant="accent" size="md">
                  View claim
                </Button>
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Ticket card */}
      <Card variant="default" className="overflow-hidden mb-6">
        <div className="p-6 border-b border-ink-100">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
                {drawTypeShortLabel[ticket.drawType]}
              </Badge>
              {ticket.awaitingDraw && (
                <Badge variant="live" withDot>
                  Awaiting draw
                </Badge>
              )}
              {!ticket.awaitingDraw && !ticket.isWinner && (
                <Badge variant="closed">Did not win</Badge>
              )}
            </div>
            {ticket.awaitingDraw && (
              <span className="inline-flex items-center gap-1 text-sm text-ink-700 tabular-nums font-mono">
                <Clock className="w-3.5 h-3.5" />
                {formatCountdown(ticket.drawScheduledAt)}
              </span>
            )}
          </div>

          <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
            {ticket.awaitingDraw ? "You're playing for" : 'Draw was for'}
          </p>
          <h1 className="font-display text-2xl font-bold text-ink-950 mt-1">
            {ticket.drawPrizeDescription}
          </h1>
          <p className="font-display text-xl font-bold text-amber-700 tabular-nums mt-2">
            {formatNaira(draw.prizeValueNgn)}
          </p>
        </div>

        <div className="bg-ink-50/50 p-6">
          <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-3">
            Your ticket reference
          </p>
          <div className="flex items-center justify-between gap-3 bg-white border border-ink-100 rounded-md px-4 py-3">
            <span className="font-mono text-base sm:text-lg text-ink-950 tracking-wide">
              {ticket.ticketRef}
            </span>
            <button
              type="button"
              onClick={copyRef}
              className={
                copied
                  ? 'inline-flex items-center gap-1.5 text-xs font-medium text-success'
                  : 'inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-navy-800 transition-colors'
              }
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              Draw date
            </p>
            <p className="text-ink-950 mt-1 font-mono">
              {formatDrawDate(ticket.drawScheduledAt)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              Draw time
            </p>
            <p className="text-ink-950 mt-1 font-mono">
              {formatDrawTime(ticket.drawScheduledAt)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              Ticket type
            </p>
            <p className="text-ink-950 mt-1">
              {ticket.ticketType === 'JACKPOT' ? 'Jackpot' : 'Daily standard'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              Face value
            </p>
            <p className="text-ink-950 mt-1 tabular-nums">
              {formatNaira(ticket.faceValueNgn)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              State of play
            </p>
            <p className="text-ink-950 mt-1">{state?.name ?? ticket.stateOfPlayCode}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              Purchased
            </p>
            <p className="text-ink-950 mt-1">{formatDrawDate(ticket.createdAt)}</p>
          </div>
        </div>
      </Card>

      {/* Sibling tickets */}
      {siblingTickets.length > 0 && (
        <Card variant="default" className="overflow-hidden mb-6">
          <div className="p-5 border-b border-ink-100">
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              Other tickets you hold for this draw
            </p>
          </div>
          <div className="p-5 space-y-2">
            {siblingTickets.map((ref) => (
              <Link
                key={ref}
                href={`/dashboard/tickets/${ref}`}
                className="flex items-center justify-between gap-3 px-3 py-2 -mx-3 rounded hover:bg-ink-50 transition-colors"
              >
                <span className="font-mono text-sm text-ink-700">{ref}</span>
                <ChevronLeft className="w-4 h-4 text-ink-300 rotate-180" />
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Verifiability footer */}
      {!ticket.awaitingDraw && (
        <Card variant="default" className="p-5 bg-ink-50/30">
          <div className="flex items-start gap-3">
            <Hash className="w-4 h-4 text-navy-800 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-ink-950">This draw was audited</p>
              <p className="text-ink-700 mt-1 leading-relaxed">
                The RNG seed hash for this draw was committed before the draw and revealed after.
                You can verify the draw on the public archive.
              </p>
              <Link
                href={`/results/${ticket.drawCode}`}
                className="inline-block mt-3 text-sm text-navy-800 hover:text-navy-700 font-medium"
              >
                View public result →
              </Link>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}