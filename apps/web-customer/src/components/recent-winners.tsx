import Link from 'next/link';
import { ExternalLink, Trophy } from 'lucide-react';
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
    <Container size="lg" className="my-16 max-w-[1400px]">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2">
            <Trophy className="h-6 w-6 text-[#4E8F01]" />
            <h2 className="font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
              Recent winners
            </h2>
          </div>

          <p className="max-w-xl text-sm leading-relaxed text-slate-500">
            Winner privacy is a hard rule. We publish ticket reference, prize, and draw
            timestamp but never names.
          </p>
        </div>

        <Link
          href="/results"
          className="inline-flex items-center gap-2 text-sm font-bold text-[#4E8F01] transition hover:text-[#3f7601]"
        >
          Full results archive <span aria-hidden="true">→</span>
        </Link>
      </div>

      <Card
        variant="default"
        className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-100 bg-[#A8E368]/10">
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Draw
                </th>
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Prize
                </th>
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Ticket reference
                </th>
                <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Drawn at
                </th>
                <th className="px-5 py-4 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Verify
                </th>
              </tr>
            </thead>

            <tbody>
              {winners.map((w, i) => {
                const isJackpot = w.drawType === 'SATURDAY_JACKPOT';

                return (
                  <tr
                    key={w.winnerTicketRef}
                    className={
                      i < winners.length - 1
                        ? 'border-b border-slate-100 transition hover:bg-[#A8E368]/10'
                        : 'transition hover:bg-[#A8E368]/10'
                    }
                  >
                    <td className="px-5 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        {isJackpot ? (
                          <Badge variant="jackpot">Jackpot</Badge>
                        ) : (
                          <Badge variant="daily">Daily</Badge>
                        )}

                        <span className="text-slate-600">
                          {isJackpot
                            ? `${drawTypeLabel[w.drawType]} · ${formatDrawDate(w.drawDate)}`
                            : formatDrawDate(w.drawDate)}
                        </span>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm font-semibold text-navy-950">
                      {w.prizeDescription}
                    </td>

                    <td className="px-5 py-4 font-mono text-sm text-slate-700">
                      {w.winnerTicketRef}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-500">
                      {formatDrawTime(w.drawDate)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/results/${w.winnerTicketRef}`}
                        className="inline-flex items-center gap-1 text-sm font-bold text-[#4E8F01] transition hover:text-[#3f7601]"
                      >
                        Seed hash <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </Container>
  );
}