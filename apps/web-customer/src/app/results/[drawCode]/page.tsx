import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Hash, ExternalLink, Search } from 'lucide-react';
import { Badge, Card, Container } from '@surewina/ui';
import { formatNaira, getStateByCode } from '@surewina/utils';
import { api } from '@/lib/api';
import { drawTypeLabel, formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';

interface ResultDetailPageProps {
  params: Promise<{ drawCode: string }>;
}

export default async function ResultDetailPage({ params }: ResultDetailPageProps) {
  const { drawCode } = await params;

  let detail;
  try {
    detail = await api.draws.getResultDetail(drawCode);
  } catch {
    notFound();
  }

  const { result } = detail;
  const isJackpot = result.drawType === 'SATURDAY_JACKPOT';

  // Sort state breakdown by ticket count desc
  const stateEntries = Object.entries(result.stateBreakdown).sort((a, b) => b[1] - a[1]);
  const totalStateTickets = stateEntries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <Container size="md" className="py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-ink-500 mb-6">
        <Link href="/results" className="hover:text-navy-800 inline-flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />
          Past results
        </Link>
        <span className="text-ink-300">/</span>
        <span className="text-ink-700 font-mono">{result.drawCode}</span>
      </nav>

      {/* Result summary card */}
      <Card variant="default" className="overflow-hidden mb-6">
        <div className="bg-navy-900 text-white p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-4">
            <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
              {drawTypeLabel[result.drawType]}
            </Badge>
            <Badge variant="verified" withDot>
              Verified
            </Badge>
          </div>

          <p className="text-[10px] uppercase tracking-wider text-white/60 font-semibold mb-1">
            Prize awarded
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold mb-2">
            {result.prizeDescription}
          </h1>
          <p className="font-display text-2xl text-amber-500 font-bold tabular-nums">
            {formatNaira(result.prizeValueNgn)}
          </p>

          <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/60 font-semibold">
                Drawn at
              </p>
              <p className="text-white mt-1 font-mono">
                {formatDrawTime(result.executedAt)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/60 font-semibold">
                Date
              </p>
              <p className="text-white mt-1">{formatDrawDate(result.executedAt)}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[10px] uppercase tracking-wider text-white/60 font-semibold">
                Tickets sold
              </p>
              <p className="text-white mt-1 tabular-nums">
                {result.totalTicketsSold.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Winner panel */}
        <div className="p-6 sm:p-8 bg-amber-50 border-b border-amber-100">
          <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-2">
            Winning ticket reference
          </p>
          <p className="font-mono text-2xl sm:text-3xl text-ink-950 font-bold tracking-wide">
            {result.winnerTicketRef}
          </p>
          <p className="text-xs text-ink-500 mt-2">
            Winner privacy is a hard rule. We never publish names — only ticket reference, draw,
            prize, and timestamp.
          </p>
        </div>

        {/* Verification block */}
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-4">
            <Hash className="w-4 h-4 text-navy-800" />
            <h2 className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              RNG seed hash
            </h2>
          </div>
          <div className="bg-ink-50 border border-ink-100 rounded-md p-4 mb-3">
            <p className="font-mono text-xs sm:text-sm text-ink-700 break-all">
              {result.rngSeedHash}
            </p>
          </div>
          <p className="text-xs text-ink-500 mb-4 leading-relaxed">
            Hash committed before the draw, seed revealed after. Anyone can re-hash the seed and
            confirm it matches what was published. This is your proof the draw was not rigged.
          </p>
          <a
            href="#"
            className="text-sm text-navy-800 hover:text-navy-700 font-medium inline-flex items-center gap-1"
          >
            Verify<ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </Card>

      {/* Was your ticket the winner? */}
      <Card variant="default" className="p-6 sm:p-8 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Search className="w-4 h-4 text-navy-800" />
          <h2 className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
            Was your ticket the winner?
          </h2>
        </div>
        <p className="text-sm text-ink-500 mb-4">
          Type your ticket reference to check. No account needed.
        </p>
        <form action="/lookup" method="GET" className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            name="ref"
            placeholder="SW-XXXX-XXXX"
            className="flex-1 h-11 px-4 bg-white border border-ink-200 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent"
          />
          <button
            type="submit"
            className="h-11 px-6 bg-navy-800 text-white text-sm font-medium rounded-md hover:bg-navy-700 transition-colors"
          >
            Check ticket
          </button>
        </form>
      </Card>

      {/* State breakdown */}
      <Card variant="default" className="p-6 sm:p-8">
        <h2 className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
          Tickets by state of play
        </h2>
        <p className="text-sm text-ink-500 mb-5">
          Every ticket is tagged with the state it was sold in. Total:{' '}
          {totalStateTickets.toLocaleString()} tickets across {stateEntries.length} states.
        </p>
        <div className="space-y-2.5">
          {stateEntries.map(([code, count]) => {
            const state = getStateByCode(code);
            const percentage = (count / totalStateTickets) * 100;
            return (
              <div key={code} className="flex items-center gap-3">
                <span className="text-sm font-medium text-ink-700 w-32 flex-shrink-0">
                  {state?.name ?? code}
                </span>
                <div className="flex-1 h-2 bg-ink-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-navy-800 rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-sm font-mono text-ink-700 w-20 text-right tabular-nums">
                  {count.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </Container>
  );
}