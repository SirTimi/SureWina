import Link from 'next/link';
import { ArrowRight, ExternalLink, Search, ShieldCheck } from 'lucide-react';
import { Badge, Card, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { api } from '@/lib/api';
import { formatDrawDateShort, formatDrawTime } from '@/lib/draw-helpers';

export default async function ResultsPage() {
  const { results } = await api.draws.listResults({ pageSize: 20 });

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pt-32 pb-20 sm:pt-36 sm:pb-24 lg:pt-40 lg:pb-28">
        <div className="absolute right-[-8%] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-navy-50 blur-3xl lg:block" />
        <div className="absolute bottom-[-120px] left-[18%] h-80 w-80 rounded-full bg-navy-50 blur-3xl" />

        <Container size="lg" className="relative max-w-[1400px]">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-navy-700/90 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur">
              <ShieldCheck className="h-4 w-4 text-white" />
              Public archive · no hidden winners
            </div>

            <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
              Past results.
              <br />
              <span className="text-navy-700">Public forever.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
              Every draw, every winning ticket reference, every seed hash. Searchable,
              permanent, and privacy-safe. We never publish winner names.
            </p>
          </div>
        </Container>
      </section>

      <Container size="lg" className="max-w-[1400px] py-14">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <ResultStat label="Draws since launch" value="247" />
          <ResultStat label="Paid out in 2026 YTD" value={formatNaira(86420000)} />
          <ResultStat label="Seed hashes verified" value="100%" />
          <ResultStat label="Median payout time" value="12.4h" />
        </div>

        {/* Search and filters */}
        <Card
          variant="default"
          className="mt-8 rounded-2xl border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
        >
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-700" />
              <input
                type="text"
                placeholder="Search by ticket ref, prize, or date..."
                className="h-11 w-full rounded-sm border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-navy-700 focus:ring-2 focus:ring-amber-400/35"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="h-11 rounded-sm bg-navy-800 px-4 text-sm font-bold text-white transition hover:bg-navy-800">
                All draws
              </button>
              <button className="h-11 rounded-sm border border-navy-200 bg-white px-4 text-sm font-bold text-navy-700 transition hover:bg-amber-50">
                Daily
              </button>
              <button className="h-11 rounded-sm border border-navy-200 bg-white px-4 text-sm font-bold text-navy-700 transition hover:bg-amber-50">
                Saturday Jackpot
              </button>
              <button className="inline-flex h-11 items-center gap-1 rounded-sm border border-navy-200 bg-white px-4 text-sm font-bold text-navy-700 transition hover:bg-amber-50">
                Date range
                <span className="text-xs">▾</span>
              </button>
            </div>
          </div>
        </Card>

        {/* Results table */}
        <Card
          variant="default"
          className="mt-6 overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-slate-100 bg-amber-50">
                  <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Date
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Prize
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Winning ticket
                  </th>
                  <th className="px-5 py-4 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Tickets sold
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Seed hash
                  </th>
                  <th className="px-5 py-4 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">
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
                      className={
                        i < results.length - 1
                          ? 'border-b border-slate-100 transition hover:bg-amber-50'
                          : 'transition hover:bg-amber-50'
                      }
                    >
                      <td className="px-5 py-4 text-sm">
                        {isJackpot ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="jackpot" className="self-start">
                              Jackpot
                            </Badge>
                            <span className="font-mono text-xs text-slate-600">
                              {formatDrawDateShort(r.executedAt)} ·{' '}
                              {formatDrawTime(r.executedAt).replace(' WAT', '')}
                            </span>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-slate-600">
                            {formatDrawDateShort(r.executedAt)} ·{' '}
                            {formatDrawTime(r.executedAt).replace(' WAT', '')}
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-sm font-semibold text-navy-950">
                        {r.prizeDescription}
                      </td>

                      <td className="px-5 py-4 font-mono text-sm text-slate-700">
                        {r.winnerTicketRef}
                      </td>

                      <td className="px-5 py-4 text-right text-sm tabular-nums text-slate-700">
                        {r.totalTicketsSold.toLocaleString()}
                      </td>

                      <td className="px-5 py-4 font-mono text-sm text-slate-500">
                        {r.rngSeedHash.slice(0, 8)}...
                      </td>

                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/results/${r.drawCode}`}
                          className="inline-flex items-center gap-1 text-sm font-bold text-navy-700 transition hover:text-navy-800"
                        >
                          Verify <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-8 rounded-2xl border border-navy-100 bg-[#F8FAF4] p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-black text-navy-950">
                Want to understand how verification works?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                We publish the seed hash before the draw and reveal the seed after the draw
                so anyone can verify the outcome.
              </p>
            </div>

            <Link
              href="/audit"
              className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-navy-200 bg-white px-4 py-3 text-sm font-bold text-navy-700 transition hover:bg-amber-50"
            >
              Read audit method
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Container>
    </>
  );
}

interface ResultStatProps {
  label: string;
  value: string;
}

function ResultStat({ label, value }: ResultStatProps) {
  return (
    <Card
      variant="default"
      className="rounded-2xl border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
        {label}
      </p>
      <p className="mt-3 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
        {value}
      </p>
    </Card>
  );
}