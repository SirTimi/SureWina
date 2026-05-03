import Link from 'next/link';
import { ExternalLink, Search } from 'lucide-react';
import { Badge, Card, Container, Stat } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { api } from '@/lib/api';
import { drawTypeLabel, formatDrawDateShort, formatDrawTime } from '@/lib/draw-helpers';

export default async function ResultsPage() {
  const { results } = await api.draws.listResults({ pageSize: 20 });

  return (
    <Container size="lg" className="py-10">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-bold text-ink-950">Past results</h1>
        <p className="text-base text-ink-500 mt-2 max-w-2xl">
          Every draw, every winning ticket reference, every seed hash. Searchable. Permanent.
          We never publish names.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Draws since launch" value="247" />
        <Stat
          label="Paid out in 2026 YTD"
          value={formatNaira(86420000)}
        />
        <Stat label="Seed hashes verified" value="100%" />
        <Stat label="Median payout time" value="12.4h" />
      </div>

      {/* Search and filters */}
      <Card variant="default" className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-ink-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by ticket ref, prize, or date..."
              className="w-full h-10 pl-10 pr-3 bg-white border border-ink-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="h-10 px-4 bg-navy-800 text-white text-sm font-medium rounded-md">
              All draws
            </button>
            <button className="h-10 px-4 bg-white border border-ink-200 text-ink-700 text-sm font-medium rounded-md hover:bg-ink-50">
              Daily
            </button>
            <button className="h-10 px-4 bg-white border border-ink-200 text-ink-700 text-sm font-medium rounded-md hover:bg-ink-50">
              Saturday Jackpot
            </button>
            <button className="h-10 px-4 bg-white border border-ink-200 text-ink-700 text-sm font-medium rounded-md hover:bg-ink-50 inline-flex items-center gap-1">
              Date range
              <span className="text-xs">▾</span>
            </button>
          </div>
        </div>
      </Card>

      {/* Results table */}
      <Card variant="default" className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/50">
              <th className="text-left text-[10px] uppercase tracking-wider text-ink-500 font-semibold px-5 py-3">
                Date
              </th>
              <th className="text-left text-[10px] uppercase tracking-wider text-ink-500 font-semibold px-5 py-3">
                Prize
              </th>
              <th className="text-left text-[10px] uppercase tracking-wider text-ink-500 font-semibold px-5 py-3">
                Winning ticket
              </th>
              <th className="text-right text-[10px] uppercase tracking-wider text-ink-500 font-semibold px-5 py-3">
                Tickets sold
              </th>
              <th className="text-left text-[10px] uppercase tracking-wider text-ink-500 font-semibold px-5 py-3">
                Seed hash
              </th>
              <th className="text-right text-[10px] uppercase tracking-wider text-ink-500 font-semibold px-5 py-3">
                Verify
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const isJackpot = r.drawType === 'SATURDAY_JACKPOT';
              return (
                <tr
                  key={r.drawCode}
                  className={i < results.length - 1 ? 'border-b border-ink-100 hover:bg-ink-50/30 transition-colors' : 'hover:bg-ink-50/30 transition-colors'}
                >
                  <td className="px-5 py-4 text-sm">
                    {isJackpot ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="jackpot" className="self-start">
                          Jackpot
                        </Badge>
                        <span className="text-ink-700 text-xs font-mono">
                          {formatDrawDateShort(r.executedAt)} · {formatDrawTime(r.executedAt).replace(' WAT', '')}
                        </span>
                      </div>
                    ) : (
                      <span className="text-ink-700 font-mono text-xs">
                        {formatDrawDateShort(r.executedAt)} · {formatDrawTime(r.executedAt).replace(' WAT', '')}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-ink-950">{r.prizeDescription}</td>
                  <td className="px-5 py-4 text-sm font-mono text-ink-700">{r.winnerTicketRef}</td>
                  <td className="px-5 py-4 text-sm text-ink-700 text-right tabular-nums">
                    {r.totalTicketsSold.toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-sm font-mono text-ink-500">
                    {r.rngSeedHash.slice(0, 8)}...
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/results/${r.drawCode}`}
                      className="text-sm text-navy-800 hover:text-navy-700 font-medium inline-flex items-center gap-1"
                    >
                      Verify <ExternalLink className="w-3 h-3" />
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