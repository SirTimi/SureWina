import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Users } from 'lucide-react';
import { Badge, Card, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatCountdown, formatDrawDate } from '@/lib/draw-helpers';
import { HowDrawWorks } from '@/components/how-draw-works';
import { BuyTicketPanel } from '@/components/buy-ticket-panel';

interface DrawDetailPageProps {
  params: Promise<{ drawCode: string }>;
}

export default async function DrawDetailPage({ params }: DrawDetailPageProps) {
  const { drawCode } = await params;

  let drawData;
  try {
    drawData = await api.draws.getById(drawCode);
  } catch {
    notFound();
  }

  const { draw, ticketsSold, prizePoolNgn } = drawData;
  const isJackpot = draw.drawType === 'SATURDAY_JACKPOT';
  const ticketCap = isJackpot ? null : 6000;
  const soldPercentage = ticketCap ? Math.min(100, (ticketsSold / ticketCap) * 100) : 0;

  // Mock seed hash for tonight's draw
  const seedHash = '9f4c2b8e1a7d6f30c5e9b2148a6d4f7c2c6e9a4b7d0f3e6c1a5b8d';
  const seedCommittedAt = '00:00 WAT';

  return (
    <Container size="lg" className="py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-ink-500 mb-6">
        <Link href="/" className="hover:text-navy-800 inline-flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />
          Active draws
        </Link>
        <span className="text-ink-300">/</span>
        <span className="text-ink-700">
          {drawTypeShortLabel[draw.drawType]} · {formatDrawDate(draw.scheduledAt)}
        </span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        {/* Left column: prize details */}
        <div className="space-y-6">
          {/* Prize image card */}
          <Card variant="default" className="overflow-hidden">
            <div className="relative bg-ink-50 aspect-[16/9] flex items-center justify-center border-b border-ink-100">
              <span className="text-xs text-ink-300 font-mono">
                [ product shot · 16:9 · {draw.prizeDescription} ]
              </span>
            </div>

            <div className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
                  {drawTypeShortLabel[draw.drawType]}
                </Badge>
                <Badge variant="live" withDot>
                  Live · selling now
                </Badge>
              </div>

              <p className="text-[10px] uppercase tracking-wider text-ink-500 font-medium mb-1">
                Today&apos;s prize
              </p>
              <h1 className="font-display text-3xl font-bold text-ink-950">
                {draw.prizeDescription}
              </h1>
              <p className="text-base text-ink-500 mt-3 leading-relaxed">
                {isJackpot
                  ? 'Guaranteed ₦4,000,000 cash prize, paid to your verified Nigerian bank account within 24 hours of KYC clearance. WHT deducted at source.'
                  : '128 GB storage · 8 GB RAM · Awesome Navy. Brand new, sealed, shipped within 3 working days to anywhere in Nigeria with full manufacturer warranty.'}
              </p>

              <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-ink-100">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
                    {isJackpot ? 'Guaranteed prize' : 'Prize value'}
                  </p>
                  <p className="text-lg font-display font-bold text-ink-950 tabular-nums mt-1">
                    {formatNaira(draw.prizeValueNgn)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
                    Ticket price
                  </p>
                  <p className="text-lg font-display font-bold text-ink-950 tabular-nums mt-1">
                    {formatNaira(draw.ticketPriceNgn)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
                    Closes in
                  </p>
                  <p className="text-lg font-display font-bold text-ink-950 tabular-nums mt-1 font-mono">
                    {formatCountdown(draw.cutoffAt)}
                  </p>
                </div>
              </div>

              {/* Tickets sold progress */}
              <div className="mt-6 pt-5 border-t border-ink-100">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="inline-flex items-center gap-1.5 text-ink-700">
                    <Users className="w-4 h-4" />
                    <span className="font-semibold tabular-nums">
                      {ticketsSold.toLocaleString()}
                    </span>{' '}
                    tickets sold so far
                  </span>
                  <span className="text-xs text-ink-500">Updated 12s ago</span>
                </div>
                {ticketCap && (
                  <>
                    <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-navy-800 rounded-full transition-all"
                        style={{ width: `${soldPercentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-ink-500 mt-2">
                      Cap: {ticketCap.toLocaleString()} tickets per daily draw. Anything above{' '}
                      {ticketCap.toLocaleString()} is refunded automatically.
                    </p>
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* How this draw works */}
          <HowDrawWorks seedHash={seedHash} seedCommittedAt={seedCommittedAt} />
        </div>

        {/* Right column: buy panel */}
        <div>
          <BuyTicketPanel draw={draw} />
        </div>
      </div>
    </Container>
  );
}