import Link from 'next/link';
import { CheckCircle2, Sparkles, Download } from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';
import { formatNaira, formatPhoneForDisplay } from '@surewina/utils';
import { drawTypeShortLabel, formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';
import { CopyableTicketRef } from '@/components/copyable-ticket-ref';

interface ConfirmationPageProps {
  searchParams: Promise<{
    refs?: string;
    draw?: string;
    phone?: string;
    paid?: string;
    newEntries?: string;
    cumCount?: string;
    toNext?: string;
  }>;
}

export default async function ConfirmationPage({ searchParams }: ConfirmationPageProps) {
  const params = await searchParams;
  const ticketRefs = (params.refs ?? '').split(',').filter(Boolean);
  const drawCode = params.draw ?? '';
  const phone = params.phone ?? '';
  const paid = parseInt(params.paid ?? '0', 10);
  const newEntries = parseInt(params.newEntries ?? '0', 10);
  const cumCount = parseInt(params.cumCount ?? '0', 10);
  const toNext = parseInt(params.toNext ?? '0', 10);

  if (ticketRefs.length === 0 || !drawCode) {
    return (
      <Container size="md" className="py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-ink-950">No tickets to show</h1>
        <p className="text-ink-500 mt-2">Start a new purchase to see your confirmation.</p>
        <Link href="/" className="inline-block mt-5">
          <Button variant="primary">Back to active draws</Button>
        </Link>
      </Container>
    );
  }

  const isJackpot = drawCode.includes('JACKPOT');
  const drawType = isJackpot ? 'SATURDAY_JACKPOT' : 'DAILY_STANDARD';

  const drawDate = new Date();
  if (isJackpot) {
    drawDate.setHours(21, 0, 0, 0);
  } else {
    drawDate.setHours(20, 0, 0, 0);
  }
  if (drawDate < new Date()) drawDate.setDate(drawDate.getDate() + 1);

  return (
    <Container size="md" className="py-12 sm:py-16">
      {/* Success header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success-bg mb-4">
          <CheckCircle2 className="w-7 h-7 text-success" />
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink-950">
          You&apos;re in the draw.
        </h1>
        <p className="text-base text-ink-500 mt-3">
          {ticketRefs.length} ticket{ticketRefs.length === 1 ? '' : 's'} purchased for the{' '}
          {drawTypeShortLabel[drawType].toLowerCase()} on{' '}
          <span className="font-semibold text-ink-950">{formatDrawDate(drawDate.toISOString())}</span>{' '}
          ·{' '}
          <span className="font-semibold text-ink-950">{formatDrawTime(drawDate.toISOString())}</span>
        </p>
      </div>

      {/* Ticket card */}
      <Card variant="default" className="overflow-hidden mb-6">
        <div className="p-6 border-b border-ink-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              {drawTypeShortLabel[drawType]}
            </p>
            <h2 className="font-display text-xl font-bold text-ink-950 mt-1">
              {isJackpot ? 'Sure Jackpot' : 'Today’s Surewina draw'}
            </h2>
          </div>
          <div className="bg-ink-50 px-3 py-1.5 rounded-md text-xs text-ink-700 font-mono whitespace-nowrap">
            {formatDrawDate(drawDate.toISOString()).slice(0, 6)} ·{' '}
            {formatDrawTime(drawDate.toISOString()).replace(' WAT', '')}
          </div>
        </div>

        <div className="bg-ink-50/50 p-6">
          <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-3">
            Your ticket reference{ticketRefs.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-2">
            {ticketRefs.map((ref) => (
              <CopyableTicketRef key={ref} ticketRef={ref} />
            ))}
          </div>

          {isJackpot && (
  <div className="mt-4 bg-amber-50 border border-amber-100 rounded-md p-3 flex items-start gap-2">
    <Sparkles className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
    <div className="text-sm text-ink-700">
      <span className="font-semibold text-amber-700">
        Direct Sure Jackpot ticket confirmed.
      </span>{' '}
      Your ticket has been added to the coming Saturday jackpot draw bucket.
    </div>
  </div>
)}

{!isJackpot && (newEntries > 0 || toNext > 0) && (
  <div className="mt-4 bg-amber-50 border border-amber-100 rounded-md p-3 flex items-start gap-2">
    <Sparkles className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
    <div className="text-sm text-ink-700">
      {newEntries > 0 ? (
        <>
          <span className="font-semibold text-amber-700">
            {newEntries} free Sure Jackpot {newEntries === 1 ? 'entry' : 'entries'} unlocked.
          </span>{' '}
          Every 10 regular tickets gives 1 free entry into the coming Saturday
          jackpot draw.
        </>
      ) : (
        <>
          <span className="font-semibold text-amber-700">
            {toNext} more regular ticket{toNext === 1 ? '' : 's'}
          </span>{' '}
          to unlock 1 free Sure Jackpot entry. Current regular ticket count:{' '}
          <span className="tabular-nums font-semibold">{cumCount}/10</span>.
        </>
      )}
    </div>
  </div>
)}
        </div>

        <div className="p-5 flex items-center justify-between gap-3 border-t border-ink-100 text-xs">
          <span className="text-ink-500">
            SMS confirmation sent to{' '}
            <span className="font-mono font-semibold text-ink-950">
              {formatPhoneForDisplay(phone)}
            </span>
          </span>
          <button
            type="button"
            className="text-navy-800 hover:text-navy-700 font-medium inline-flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            Download receipt
          </button>
        </div>
      </Card>

      <p className="text-xs text-ink-500 text-center mb-6">
        Total paid: <span className="font-semibold text-ink-700 tabular-nums">{formatNaira(paid)}</span>
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href={`/draws/${drawCode}`}>
          <Button variant="primary" size="md">
            Buy more tickets
          </Button>
        </Link>
        <Link href={`/draws/${drawCode}/live`}>
          <Button variant="secondary" size="md">
            Watch the draw live
          </Button>
        </Link>
      </div>

      <p className="text-xs text-ink-500 text-center mt-8 max-w-md mx-auto leading-relaxed">
        Keep your ticket reference safe. You&apos;ll need it to check your result. We never publish
        winner names, only ticket references.
      </p>
    </Container>
  );
}