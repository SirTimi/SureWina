import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ChevronRight, Sparkles } from 'lucide-react';
import { Button, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { api } from '@/lib/api';
import { DrawCard } from '@/components/draw-card';

export const metadata: Metadata = {
  title: 'Active draws · Surewina',
  description:
    'Every Surewina draw currently open for tickets. Daily product draws and the Saturday ₦4M jackpot.',
};

export default async function DrawsPage() {
  const { draws } = await api.draws.listActive();

  // Fetch ticketsSold for each draw in parallel
  const drawsWithStats = await Promise.all(
    draws.map(async (draw) => {
      try {
        const detail = await api.draws.getById(draw.drawCode);
        return { draw, ticketsSold: detail.ticketsSold };
      } catch {
        return { draw, ticketsSold: undefined };
      }
    }),
  );

  const dailyDraws = drawsWithStats.filter((d) => d.draw.drawType === 'DAILY_STANDARD');
  const jackpotDraws = drawsWithStats.filter((d) => d.draw.drawType === 'SATURDAY_JACKPOT');

  // Sum the total prize value across all active draws
  const totalPrizePoolNgn = drawsWithStats.reduce(
    (sum, d) => sum + d.draw.prizeValueNgn,
    0,
  );

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-950 to-[#08152a] text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#A8E368]/40 to-transparent" />
        <div className="pointer-events-none absolute right-[-15%] top-[10%] h-[420px] w-[420px] rounded-full bg-[#A8E368]/8 blur-3xl" />
        <div className="pointer-events-none absolute left-[-10%] bottom-[-10%] h-[300px] w-[300px] rounded-full bg-amber-500/8 blur-3xl" />

        <Container size="lg" className="relative z-10 max-w-[1180px] py-14 lg:py-20">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 transition hover:text-[#A8E368]"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            Back to home
          </Link>

          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#A8E368]">
            Active draws
          </div>

          <h1 className="mt-3 max-w-3xl font-display text-4xl font-black leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
            Every prize currently up for grabs.
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
            Daily product draws plus the Saturday {formatNaira(4000000)} jackpot. One ticket
            puts you in the running. Every draw publishes its RNG seed before it runs.
          </p>

          {/* Stat strip */}
          <div className="mt-10 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat value={String(draws.length)} label="Open draws" />
            <Stat value={String(dailyDraws.length)} label="Daily draws" />
            <Stat value={String(jackpotDraws.length)} label="Jackpot draws" />
            <Stat
              value={formatNaira(totalPrizePoolNgn)}
              label="Total prize pool"
              wide
            />
          </div>
        </Container>
      </section>

      {/* Jackpot section (always first if any) */}
      {jackpotDraws.length > 0 && (
        <Container size="lg" className="max-w-[1180px] py-12 lg:py-16">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
                <Sparkles className="h-3.5 w-3.5" />
                The big one
              </div>
              <h2 className="mt-3 font-display text-3xl font-black text-navy-950 sm:text-4xl">
                Saturday jackpot.
              </h2>
              <p className="mt-2 max-w-xl text-base text-slate-600">
                Drawn live every Saturday at 21:00 WAT. Cash prize, paid to your bank within 24
                hours of KYC clearance.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {jackpotDraws.map(({ draw, ticketsSold }) => (
              <DrawCard key={draw.drawCode} draw={draw} ticketsSold={ticketsSold} />
            ))}
          </div>
        </Container>
      )}

      {/* Daily draws section */}
      <section className="bg-gradient-to-b from-emerald-50/30 via-white to-white">
        <Container size="lg" className="max-w-[1180px] py-12 lg:py-16">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                Daily product draws
              </div>
              <h2 className="mt-3 font-display text-3xl font-black text-navy-950 sm:text-4xl">
                Tonight, tomorrow, and the rest of the week.
              </h2>
              <p className="mt-2 max-w-xl text-base text-slate-600">
                A new product prize every day. Tickets are ₦500 each. Buy 10 and earn one free
                jackpot entry on us.
              </p>
            </div>
          </div>

          {dailyDraws.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <p className="text-slate-500">
                No daily draws are open right now. Check back soon.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {dailyDraws.map(({ draw, ticketsSold }) => (
                <DrawCard key={draw.drawCode} draw={draw} ticketsSold={ticketsSold} />
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* Bottom CTA */}
      <Container size="lg" className="max-w-[1180px] py-12 lg:py-16">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-navy-950 via-navy-950 to-[#08152a] p-8 text-white sm:p-12">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-sm border border-[#A8E368]/30 bg-[#A8E368]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#A8E368]">
                <Sparkles className="h-3.5 w-3.5" />
                The 10-for-1 rule
              </div>
              <h2 className="mt-3 font-display text-3xl font-black leading-tight sm:text-4xl">
                Stack 10 daily tickets, earn a free Saturday entry.
              </h2>
              <p className="mt-3 max-w-md text-sm text-white/70">
                Every 10 daily tickets you buy automatically earns one free entry into the next
                Saturday jackpot. No subscription, no hidden math — your tally is on your
                dashboard.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/how-it-works">
                  <Button variant="secondary" size="lg" className="rounded-sm">
                    See how it works
                  </Button>
                </Link>
                <Link href="/sign-in">
                  <Button
                    variant="accent"
                    size="lg"
                    className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 shadow-[0_16px_34px_rgba(78,143,1,0.22)] hover:!border-transparent hover:bg-[#B7EF79]"
                  >
                    Track my tickets
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#A8E368]">
                The math, simply
              </p>
              <ul className="mt-4 space-y-3 text-sm text-white/80">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#A8E368]" />
                  <span>1 daily ticket = ₦500</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#A8E368]" />
                  <span>10 daily tickets = ₦5,000 + 1 free jackpot entry</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#A8E368]" />
                  <span>1 Saturday jackpot ticket alone = ₦5,000</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#A8E368]" />
                  <span>Same price either way — but daily gives 10 chances first</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}

interface StatProps {
  value: string;
  label: string;
  wide?: boolean;
}

function Stat({ value, label, wide }: StatProps) {
  return (
    <div className={wide ? 'col-span-2 sm:col-span-1' : ''}>
      <p className="font-display text-2xl font-black tabular-nums sm:text-3xl">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
        {label}
      </p>
    </div>
  );
}