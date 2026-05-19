import { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';
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

  const totalPrizePoolNgn = drawsWithStats.reduce(
    (sum, d) => sum + d.draw.prizeValueNgn,
    0,
  );

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pb-20 pt-32 sm:pb-24 sm:pt-36 lg:pb-28 lg:pt-40">
        <div className="absolute right-[-8%] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-navy-50 blur-3xl lg:block" />
        <div className="absolute bottom-[-120px] left-[18%] h-80 w-80 rounded-full bg-navy-50 blur-3xl" />

        <Container size="lg" className="relative max-w-[1400px]">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-1 text-sm font-bold text-navy-700 transition hover:text-navy-800"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            Back to home
          </Link>

          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-navy-700/90 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur">
              <ShieldCheck className="h-4 w-4 text-white" />
              Active draws · regulated and verifiable
            </div>

            <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
              Every prize
              <br />
              <span className="text-navy-700">currently up for grabs.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
              Daily product draws plus the Saturday {formatNaira(4000000)} jackpot.
              One ticket puts you in the running. Every draw publishes its RNG seed
              before it runs.
            </p>

            <div className="mt-10 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
              <Stat value={String(draws.length)} label="Open draws" />
              <Stat value={String(dailyDraws.length)} label="Daily draws" />
              <Stat value={String(jackpotDraws.length)} label="Jackpot draws" />
              <Stat value={formatNaira(totalPrizePoolNgn)} label="Total prize pool" wide />
            </div>
          </div>
        </Container>
      </section>

      {/* Jackpot section */}
      {jackpotDraws.length > 0 && (
        <section className="bg-white">
          <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-sm border border-navy-200 bg-amber-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-navy-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  The big one
                </div>

                <h2 className="mt-3 font-display text-3xl font-black tracking-[-0.03em] text-navy-950 sm:text-4xl">
                  Saturday jackpot.
                </h2>

                <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-600">
                  Drawn live every Saturday at 21:00 WAT. Cash prize, paid to your bank
                  within 24 hours of KYC clearance.
                </p>
              </div>
            </div>

            <Card
              variant="default"
              className="overflow-hidden rounded-3xl border-navy-100 bg-[#F8FAF4] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.07)] lg:p-5"
            >
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.82fr)_minmax(360px,0.55fr)] lg:items-stretch">
                <div className="grid grid-cols-1">
                  {jackpotDraws.map(({ draw, ticketsSold }) => (
                    <DrawCard key={draw.drawCode} draw={draw} ticketsSold={ticketsSold} />
                  ))}
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-navy-800 p-6 text-white lg:p-8">
                  <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-navy-50 blur-3xl" />
                  <div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

                  <div className="relative flex h-full flex-col justify-between">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-sm bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-950">
                        <Trophy className="h-3.5 w-3.5" />
                        Jackpot draw
                      </div>

                      <h3 className="mt-5 font-display text-3xl font-black leading-tight tracking-[-0.04em] text-white">
                        One Saturday draw.
                        <br />
                        One major cash prize.
                      </h3>

                      <p className="mt-4 text-sm leading-relaxed text-white/75">
                        The Saturday jackpot is the main weekly draw. Your ticket enters
                        you into the {formatNaira(4000000)} cash prize pool, with results
                        published publicly after the draw.
                      </p>
                    </div>

                    <div className="mt-8 grid gap-3">
                      <JackpotPoint
                        icon={<CalendarDays className="h-4 w-4" />}
                        title="Draw time"
                        body="Every Saturday · 21:00 WAT"
                      />
                      <JackpotPoint
                        icon={<ShieldCheck className="h-4 w-4" />}
                        title="Verification"
                        body="Seed hash published before the draw and revealed after."
                      />
                      <JackpotPoint
                        icon={<Sparkles className="h-4 w-4" />}
                        title="Payout"
                        body="Paid to your verified bank account after claim checks."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </Container>
        </section>
      )}

      {/* Daily draws section */}
      <section className="bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-sm border border-navy-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-navy-700">
                Daily product draws
              </div>

              <h2 className="mt-3 max-w-3xl font-display text-3xl font-black tracking-[-0.03em] text-navy-950 sm:text-4xl">
                Tonight, tomorrow, and the rest of the week.
              </h2>

              <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-600">
                A new product prize every day. Tickets are ₦500 each. Buy 10 and earn
                one free jackpot entry on us.
              </p>
            </div>
          </div>

          {dailyDraws.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
              <p className="text-slate-500">
                No daily draws are open right now. Check back soon.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {dailyDraws.map(({ draw, ticketsSold }) => (
                <DrawCard key={draw.drawCode} draw={draw} ticketsSold={ticketsSold} />
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* Bottom CTA */}
      <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
        <Card
          variant="default"
          className="overflow-hidden rounded-3xl border border-navy-200 bg-navy-800 p-8 text-white shadow-[0_24px_70px_rgba(14,42,71,0.18)] sm:p-12"
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-sm bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-navy-950">
                <Sparkles className="h-3.5 w-3.5" />
                The 10-for-1 rule
              </div>

              <h2 className="mt-4 font-display text-3xl font-black leading-tight tracking-[-0.03em] text-white sm:text-4xl">
                Stack 10 daily tickets, earn a free Saturday entry.
              </h2>

              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75">
                Every 10 daily tickets you buy automatically earns one free entry into
                the next Saturday jackpot. No subscription, no hidden math — your tally
                is on your dashboard.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/how-it-works">
                  <Button
                    variant="secondary"
                    size="lg"
                    className="rounded-sm border-white/20 bg-white/10 font-bold text-white hover:bg-white/15"
                  >
                    See how it works
                  </Button>
                </Link>

                <Link href="/sign-in">
                  <Button
                    variant="accent"
                    size="lg"
                    className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 shadow-[0_16px_34px_rgba(14,42,71,0.18)] hover:!border-transparent hover:bg-amber-400"
                  >
                    Track my tickets
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400">
                The math, simply
              </p>

              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-white/80">
                <MathItem>1 daily ticket = ₦500</MathItem>
                <MathItem>10 daily tickets = ₦5,000 + 1 free jackpot entry</MathItem>
                <MathItem>1 Saturday jackpot ticket alone = ₦5,000</MathItem>
                <MathItem>Same price either way — but daily gives 10 chances first</MathItem>
              </ul>
            </div>
          </div>
        </Card>
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
    <Card
      variant="default"
      className={
        wide
          ? 'col-span-2 rounded-2xl border-navy-100 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur md:col-span-1'
          : 'rounded-2xl border-navy-100 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur'
      }
    >
      <p className="font-display text-2xl font-black tracking-[-0.03em] text-navy-950 tabular-nums sm:text-3xl">
        {value}
      </p>

      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
        {label}
      </p>
    </Card>
  );
}

function JackpotPoint({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-amber-500 text-navy-950">
          {icon}
        </div>
        <div>
          <p className="text-sm font-black text-white">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/65">{body}</p>
        </div>
      </div>
    </div>
  );
}

function MathItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
      <span>{children}</span>
    </li>
  );
}