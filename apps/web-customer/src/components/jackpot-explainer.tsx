import Link from 'next/link';
import { ArrowRight, Star } from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';

export function JackpotExplainer() {
  return (
    <Container size="lg" className="my-16">
      <Card
        variant="dark"
        className="relative overflow-hidden rounded-3xl border border-navy-800 bg-navy-950 p-8 shadow-[0_28px_80px_rgba(15,23,42,0.18)] sm:p-10"
      >
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.88fr_1.12fr]">
          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-amber-400">
              The 10-for-1 rule
            </p>

            <h2 className="font-display text-4xl font-black leading-[1.05] tracking-[-0.04em] text-white sm:text-5xl">
              Every 10 daily tickets earns you{' '}
              <span className="text-amber-400">1 free</span> Saturday jackpot entry.
            </h2>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
              Buy daily tickets, win daily prizes, and quietly stack entries into the
              ₦4,000,000 Saturday draw. No subscription, no hidden math, the count is on
              your dashboard, always.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/how-it-works">
                <Button
                  variant="accent"
                  size="md"
                  className="rounded-xl bg-amber-400 font-bold text-navy-950 hover:bg-amber-300"
                >
                  See full rules
                </Button>
              </Link>

              <Link href="/audit">
                <Button
                  variant="secondary"
                  size="md"
                  className="rounded-xl border-white/15 bg-white/10 font-bold text-white hover:bg-white/15"
                >
                  Read the licence
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
            <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-16 w-14 flex-col items-center justify-center rounded-xl border border-white/15 bg-white/8 shadow-sm backdrop-blur"
                >
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span className="mt-1 text-[9px] font-black uppercase tracking-tight text-white/70">
                    Ticket
                  </span>
                </div>
              ))}
            </div>

            <ArrowRight className="hidden h-8 w-8 shrink-0 text-amber-400 sm:block" />

            <div className="relative min-w-[150px] rounded-2xl border border-amber-300 bg-amber-400 px-6 py-5 text-center text-navy-950 shadow-[0_18px_40px_rgba(245,158,11,0.25)]">
              <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-navy-950" />
              <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-navy-950" />
              <p className="text-sm font-black uppercase">1 entry</p>
              <p className="mt-1 text-xl font-black">Sat ₦4M</p>
              <p className="mt-1 text-xs font-bold opacity-70">Jackpot</p>
            </div>
          </div>
        </div>
      </Card>
    </Container>
  );
}