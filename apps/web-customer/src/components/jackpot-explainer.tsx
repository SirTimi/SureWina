import Link from 'next/link';
import { ArrowRight, Star, Ticket } from 'lucide-react';
import { Button, Container } from '@surewina/ui';

export function JackpotExplainer() {
  return (
    <section className="my-16 overflow-hidden">
      <style>
        {`
          @keyframes giant-ticket-enter {
            0% {
              opacity: 0;
              transform: translateX(-120px);
            }
            70% {
              opacity: 1;
              transform: translateX(10px);
            }
            100% {
              opacity: 1;
              transform: translateX(0);
            }
          }
        `}
      </style>

      <Container size="lg" className="max-w-[1500px]">
        <div
          className="relative ml-[calc(50%-50vw)] w-[calc(100vw-2.5rem)] max-w-[1220px] overflow-hidden rounded-r-[36px] border border-amber-400/30 bg-navy-800 py-8 pr-8 pl-12 text-white shadow-[0_28px_80px_rgba(14,42,71,0.32)] sm:w-[calc(100vw-4rem)] sm:py-10 sm:pr-10 sm:pl-16 lg:w-[calc(100vw-10rem)] lg:pl-20 xl:w-[calc(100vw-14rem)] 2xl:w-[1180px]"
          style={{ animation: 'giant-ticket-enter 900ms ease-out both' }}
        >
          <div className="absolute -right-10 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full bg-white" />

          <div className="absolute inset-y-8 right-[26%] hidden border-l border-dashed border-white/30 lg:block" />

          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_300px]">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-sm bg-amber-500 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-navy-900">
                <Ticket className="h-4 w-4" />
                The 10-for-1 rule
              </div>

              <h2 className="font-display text-4xl font-black leading-[1.05] tracking-[-0.04em] text-white sm:text-5xl">
                Every 10 daily tickets earns you{' '}
                <span className="text-amber-400">1 free</span> Saturday jackpot entry.
              </h2>

              <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/75">
                Buy daily tickets, win daily prizes, and quietly stack entries into the
                ₦4,000,000 Saturday draw. No subscription, no hidden math — the count is on
                your dashboard, always.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/how-it-works">
                  <Button variant="accent" size="md" className="rounded-sm font-bold">
                    See full rules
                  </Button>
                </Link>

                <Link href="/audit">
                  <Button
                    variant="secondary"
                    size="md"
                    className="rounded-sm border-white/20 bg-white/10 font-bold text-white hover:bg-white/15"
                  >
                    Read the licence
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-400">
                  Ticket stack
                </p>
                <ArrowRight className="h-5 w-5 text-amber-400" />
              </div>

              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex h-12 flex-col items-center justify-center rounded-lg border border-white/15 bg-white/10 shadow-sm"
                  >
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="mt-1 text-[7px] font-black uppercase tracking-tight text-white/65">
                      Ticket
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-amber-500 px-5 py-4 text-navy-900">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-navy-800">
                  Reward
                </p>
                <p className="mt-1 font-display text-2xl font-black tracking-[-0.04em]">
                  1 Free Jackpot Entry
                </p>
                <p className="mt-1 text-sm font-bold text-navy-900/70">
                  Saturday ₦4,000,000 draw
                </p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}