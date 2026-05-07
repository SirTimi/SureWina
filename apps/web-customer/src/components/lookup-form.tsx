'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Search } from 'lucide-react';
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
    <div>
      <Card
        variant="default"
        className="mb-6 rounded-2xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
      >
        <form onSubmit={handleSubmit}>
          <label
            htmlFor="ticket-ref"
            className="mb-2 block text-sm font-black text-navy-950"
          >
            Ticket reference
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4E8F01]" />

              <input
                id="ticket-ref"
                type="text"
                value={ticketRef}
                onChange={(e) => setTicketRef(e.target.value.toUpperCase())}
                placeholder="SW-XXXX-XXXX"
                className="h-12 w-full rounded-sm border border-slate-200 bg-white pl-11 pr-4 font-mono text-base text-navy-950 outline-none transition placeholder:text-slate-400 focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/35"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={result.status === 'loading'}
              className="rounded-sm !border-transparent bg-[#4E8F01] px-7 font-bold text-white hover:!border-transparent hover:bg-[#3f7601]"
            >
              {result.status === 'loading' ? 'Checking' : 'Check ticket'}
            </Button>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Format:{' '}
            <span className="font-mono font-semibold text-navy-950">SW-XXXX-XXXX</span>{' '}
            — find it in your SMS receipt.
          </p>
        </form>
      </Card>

      {result.status === 'error' && <ErrorPanel message={result.message} />}
      {result.status === 'success' && <ResultPanel data={result.data} />}
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <Card
      variant="default"
      className="overflow-hidden rounded-2xl border-red-100 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
    >
      <div className="border-b border-red-100 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

          <div>
            <p className="text-sm font-black text-navy-950">Ticket not found</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{message}</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <p className="text-xs leading-relaxed text-slate-500">
          Tickets are issued in the format{' '}
          <span className="font-mono font-semibold text-navy-950">SW-XXXX-XXXX</span>.
          Check your SMS receipt for the exact reference, or contact{' '}
          <a href="mailto:help@surewina.ng" className="font-bold text-[#4E8F01] underline">
            help@surewina.ng
          </a>
          .
        </p>
      </div>
    </Card>
  );
}

function ResultPanel({ data }: { data: LookupTicketResponse }) {
  const { ticket, isWinner, claimUrl } = data;
  const isAwaitingDraw = ticket.status === 'ACTIVE';

  if (isWinner) {
    return (
      <Card
        variant="default"
        className="overflow-hidden rounded-2xl border-[#A8E368]/50 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
      >
        <div className="bg-[#A8E368]/25 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[#4E8F01]" />

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4E8F01]">
                Winning ticket
              </p>
              <h2 className="mt-0.5 font-display text-xl font-black text-navy-950">
                You won — {ticket.drawCode}
              </h2>
              <p className="mt-1 font-mono text-sm text-slate-700">
                {ticket.ticketRef}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 p-6 text-sm">
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Draw
            </p>
            <p className="text-slate-700">
              {
                drawTypeLabel[
                  ticket.ticketType === 'JACKPOT'
                    ? 'SATURDAY_JACKPOT'
                    : 'DAILY_STANDARD'
                ]
              }{' '}
              · {formatDrawDate(ticket.createdAt)}
            </p>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Status
            </p>
            <Badge variant="verified" withDot>
              Awaiting claim
            </Badge>
          </div>
        </div>

        {claimUrl && (
          <div className="flex flex-col justify-between gap-4 border-t border-[#4E8F01]/10 bg-[#F8FAF4] p-5 sm:flex-row sm:items-center">
            <div className="text-sm">
              <p className="font-black text-navy-950">Sign in to claim.</p>
              <p className="mt-0.5 text-slate-600">
                We&apos;ll verify your phone matches the ticket and process the payout.
              </p>
            </div>

            <Link href={claimUrl}>
              <Button
                variant="accent"
                size="md"
                className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 hover:!border-transparent hover:bg-[#B7EF79]"
              >
                Sign in to claim
              </Button>
            </Link>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card
      variant="default"
      className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
    >
      <div className="border-b border-slate-100 bg-[#F8FAF4] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4E8F01]">
          Ticket found
        </p>
        <p className="mt-1 font-mono text-lg font-black text-navy-950">
          {ticket.ticketRef}
        </p>
      </div>

      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <ResultDetail label="Draw" value={ticket.drawCode} />
          <ResultDetail
            label="Ticket type"
            value={ticket.ticketType === 'JACKPOT' ? 'Jackpot' : 'Daily standard'}
          />
          <ResultDetail label="Face value" value={formatNaira(ticket.faceValueNgn)} />

          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Status
            </p>
            <Badge variant={isAwaitingDraw ? 'live' : 'closed'} withDot={isAwaitingDraw}>
              {isAwaitingDraw ? 'Awaiting draw' : 'Did not win'}
            </Badge>
          </div>
        </div>

        {!isAwaitingDraw && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-sm leading-relaxed text-slate-600">
              This ticket didn&apos;t win, but if it was a daily standard ticket it still
              counts toward your next Saturday jackpot entry: every 10 daily tickets = 1
              free entry.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function ResultDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="text-sm text-slate-700">{value}</p>
    </div>
  );
}