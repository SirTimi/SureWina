'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { Badge, Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { api } from '@/lib/api';
import type { LookupTicketResponse } from '@surewina/types';
import { drawTypeLabel, formatDrawDate } from '@/lib/draw-helpers';

interface LookupFormProps {
  initialRef?: string;
}

type LookupResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: LookupTicketResponse }
  | { status: 'error'; message: string };

export function LookupForm({ initialRef = '' }: LookupFormProps) {
  const [ticketRef, setTicketRef] = useState(initialRef);
  const [result, setResult] = useState<LookupResult>({ status: 'idle' });
  const [, startTransition] = useTransition();

  const handleLookup = async (ref: string) => {
    if (!ref.trim()) {
      setResult({ status: 'error', message: 'Please enter a ticket reference.' });
      return;
    }

    setResult({ status: 'loading' });
    try {
      const data = await api.tickets.lookup({ ticketRef: ref.trim() });
      setResult({ status: 'success', data });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message.includes('not found')
            ? 'No ticket matches this reference. Check the format and try again.'
            : err.message
          : 'Something went wrong. Try again.';
      setResult({ status: 'error', message });
    }
  };

  // Auto-lookup on mount if initialRef provided
  if (initialRef && result.status === 'idle') {
    startTransition(() => {
      handleLookup(initialRef);
    });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLookup(ticketRef);
  };

  return (
    <>
      {/* Form card */}
      <Card variant="default" className="p-6 mb-6">
        <form onSubmit={handleSubmit}>
          <label
            htmlFor="ticket-ref"
            className="block text-sm font-medium text-ink-700 mb-2"
          >
            Ticket reference
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="ticket-ref"
              type="text"
              value={ticketRef}
              onChange={(e) => setTicketRef(e.target.value.toUpperCase())}
              placeholder="SW-XXXX-XXXX"
              className="flex-1 h-11 px-4 bg-white border border-ink-200 rounded-md font-mono text-base focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={result.status === 'loading'}
            >
              {result.status === 'loading' ? 'Checking' : 'Check'}
            </Button>
          </div>
          <p className="text-xs text-ink-500 mt-2">
            Format: <span className="font-mono">SW-XXXX-XXXX</span> (find it in your SMS receipt)
          </p>
        </form>
      </Card>

      {/* Result panel */}
      {result.status === 'error' && <ErrorPanel message={result.message} />}
      {result.status === 'success' && <ResultPanel data={result.data} />}
    </>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <Card variant="default" className="border-danger-bg overflow-hidden">
      <div className="bg-danger-bg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm text-ink-950 mb-1">Ticket not found</p>
          <p className="text-sm text-ink-700">{message}</p>
          <p className="text-xs text-ink-500 mt-3">
            Tickets are issued in the format <span className="font-mono">SW-XXXX-XXXX</span>.
            Check your SMS receipt for the exact reference, or contact{' '}
            <a href="mailto:help@surewina.ng" className="underline hover:text-navy-700">
              help@surewina.ng
            </a>
            .
          </p>
        </div>
      </div>
    </Card>
  );
}

function ResultPanel({ data }: { data: LookupTicketResponse }) {
  const { ticket, isWinner, claimUrl } = data;
  const isAwaitingDraw = ticket.status === 'ACTIVE';

  if (isWinner) {
    return (
      <Card variant="default" className="overflow-hidden border-success-bg">
        <div className="bg-success-bg p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-success font-semibold">
                Winning ticket
              </p>
              <h2 className="font-display text-xl font-bold text-ink-950 mt-0.5">
                You won — {ticket.drawCode}
              </h2>
              <p className="font-mono text-sm text-ink-700 mt-1">{ticket.ticketRef}</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
              Draw
            </p>
            <p className="text-ink-700">
              {drawTypeLabel[ticket.ticketType === 'JACKPOT' ? 'SATURDAY_JACKPOT' : 'DAILY_STANDARD']}{' '}
              · {formatDrawDate(ticket.createdAt)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
              Status
            </p>
            <Badge variant="verified" withDot>
              Awaiting claim
            </Badge>
          </div>
        </div>

        {claimUrl && (
          <div className="border-t border-amber-100 bg-amber-50 p-5 flex items-center justify-between gap-4">
            <div className="text-sm">
              <p className="font-semibold text-amber-700">Sign in to claim.</p>
              <p className="text-ink-700 mt-0.5">
                We&apos;ll verify your phone matches the ticket and pay out within 24 hours.
              </p>
            </div>
            <Link href={claimUrl}>
              <Button variant="accent" size="md">
                Sign in to claim
              </Button>
            </Link>
          </div>
        )}
      </Card>
    );
  }

  // Non-winning ticket
  return (
    <Card variant="default" className="overflow-hidden">
      <div className="bg-ink-50 p-5">
        <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
          Ticket found
        </p>
        <p className="font-mono text-lg text-ink-950 mt-1">{ticket.ticketRef}</p>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
              Draw
            </p>
            <p className="text-ink-700">{ticket.drawCode}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
              Ticket type
            </p>
            <p className="text-ink-700">
              {ticket.ticketType === 'JACKPOT' ? 'Jackpot' : 'Daily standard'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
              Face value
            </p>
            <p className="text-ink-700 tabular-nums">{formatNaira(ticket.faceValueNgn)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
              Status
            </p>
            <Badge variant={isAwaitingDraw ? 'live' : 'closed'} withDot={isAwaitingDraw}>
              {isAwaitingDraw ? 'Awaiting draw' : 'Did not win'}
            </Badge>
          </div>
        </div>

        {!isAwaitingDraw && (
          <div className="border-t border-ink-100 pt-4">
            <p className="text-sm text-ink-700 leading-relaxed">
              This ticket didn&apos;t win, but if it was a daily standard ticket it still counts
              toward your next Saturday jackpot entry (every 10 daily tickets = 1 free entry).
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}