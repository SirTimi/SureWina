import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Badge, Card, Container } from '@surewina/ui';
import type { RecentWinnerStat } from '@surewina/types';

interface RecentWinnersProps {
  winners: RecentWinnerStat[];
}

const drawTypeLabel: Record<RecentWinnerStat['drawType'], string> = {
  DAILY_STANDARD: 'Daily',
  SATURDAY_JACKPOT: 'Saturday Jackpot',
  PRODUCT_PRIZE: 'Product',
};

function formatDrawDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short' });
}

function formatDrawTime(iso: string): string {
  const d = new Date(iso);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} WAT`;
}

export function RecentWinners({ winners }: RecentWinnersProps) {
  return (
    <Container size="lg" className="my-16">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-semibold text-ink-950">
            Recent winners
          </h2>
          <p className="text-sm text-ink-500 mt-1 max-w-xl">
            Winner privacy is a hard rule. We publish ticket reference, prize, and draw
            timestamp, We would never use names.
          </p>
        </div>
        <Link
          href="/results"
          className="text-sm text-navy-800 hover:text-navy-700 font-medium inline-flex items-center gap-1"
        >
          Full results archive →
        </Link>
      </div>

      <Card variant="default" className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/50">
              <th className="text-left text-[10px] uppercase tracking-wider text-ink-500 font-semibold px-5 py-3">Draw</th>
              <th className="text-left text-[10px] uppercase tracking-wider text-ink-500 font-semibold px-5 py-3">Prize</th>
              <th className="text-left text-[10px] uppercase tracking-wider text-ink-500 font-semibold px-5 py-3">Ticket reference</th>
              <th className="text-left text-[10px] uppercase tracking-wider text-ink-500 font-semibold px-5 py-3">Drawn at</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-ink-500 font-semibold px-5 py-3">Verify</th>
            </tr>
          </thead>
          <tbody>
            {winners.map((w, i) => {
              const isJackpot = w.drawType === 'SATURDAY_JACKPOT';
              return (
                <tr
                  key={w.winnerTicketRef}
                  className={i < winners.length - 1 ? 'border-b border-ink-100' : ''}
                >
                  <td className="px-5 py-4 text-sm">
                    {isJackpot ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="jackpot" className="self-start">Jackpot</Badge>
                        <span className="text-ink-500 text-xs">
                          {drawTypeLabel[w.drawType]} · {formatDrawDate(w.drawDate)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-ink-700">
                        {drawTypeLabel[w.drawType]} · {formatDrawDate(w.drawDate)}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-ink-950">{w.prizeDescription}</td>
                  <td className="px-5 py-4 text-sm font-mono text-ink-700">{w.winnerTicketRef}</td>
                  <td className="px-5 py-4 text-sm text-ink-500">{formatDrawTime(w.drawDate)}</td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/results/${w.winnerTicketRef}`}
                      className="text-sm text-navy-800 hover:text-navy-700 font-medium inline-flex items-center gap-1"
                    >
                      Seed hash <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </Container>
  );
}